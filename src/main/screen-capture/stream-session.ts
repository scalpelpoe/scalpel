import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, session } from 'electron'
import type { GameCapture, GameCaptureStreamFailure, GameRect } from '../../plugin-sdk/src/types'
import {
  CAPTURE_BROKER_COMMAND_EVENT,
  CAPTURE_BROKER_READY_EVENT,
  CAPTURE_BROKER_RESPONSE_EVENT,
  type CaptureBrokerCommand,
  type CaptureBrokerResponse,
} from '@shared/game-capture-stream-protocol'
import { resolveGameWindowDesktopSource, type GameWindowDesktopSourceInfo } from '../handlers/screen-source'

const RENDERER_READY_TIMEOUT_MS = 5_000
const START_TIMEOUT_MS = 5_000
const CAPTURE_TIMEOUT_MS = 2_500
const STOP_TIMEOUT_MS = 1_000

export class CaptureStreamSessionError extends Error {
  constructor(
    readonly failure: GameCaptureStreamFailure,
    readonly heavy: boolean,
  ) {
    super(failure.message)
    this.name = failure.name ?? 'CaptureStreamSessionError'
  }
}

export interface CaptureStreamSession {
  readonly generation: number
  readonly sourceId: string | undefined
  readonly frameSize: { width: number; height: number } | undefined
  readonly gameSize: { width: number; height: number } | undefined
  start(): Promise<void>
  capture(region?: GameRect): Promise<GameCapture>
  stop(): Promise<void>
  destroy(): void
  onFatal(handler: (error: CaptureStreamSessionError) => void): () => void
}

type PendingRequest = {
  resolve: (response: CaptureBrokerResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

function sessionFailure(
  kind: GameCaptureStreamFailure['kind'],
  stage: GameCaptureStreamFailure['stage'],
  message: string,
  name?: string,
): GameCaptureStreamFailure {
  return { kind, stage, message, ...(name ? { name } : {}) }
}

function responseError(response: Extract<CaptureBrokerResponse, { type: 'failed' }>): CaptureStreamSessionError {
  return new CaptureStreamSessionError(response.failure, response.failure.kind !== 'source-unresolved')
}

export class ElectronCaptureStreamSession implements CaptureStreamSession {
  readonly generation: number

  private readonly window: BrowserWindow
  private readonly pending = new Map<string, PendingRequest>()
  private readonly fatalHandlers = new Set<(error: CaptureStreamSessionError) => void>()
  private readonly ready: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: Error) => void
  private readyTimer: ReturnType<typeof setTimeout>
  private currentSource: GameWindowDesktopSourceInfo | undefined
  private currentFrameSize: { width: number; height: number } | undefined
  private destroyed = false

  private readonly onReadyMessage = (event: Electron.IpcMainEvent): void => {
    if (event.sender.id !== this.window.webContents.id) return
    clearTimeout(this.readyTimer)
    this.resolveReady()
  }

  private readonly onResponseMessage = (event: Electron.IpcMainEvent, response: CaptureBrokerResponse): void => {
    if (event.sender.id !== this.window.webContents.id) return
    if (response.type === 'fatal') {
      const error = new CaptureStreamSessionError(response.failure, true)
      for (const handler of this.fatalHandlers) handler(error)
      return
    }
    const pending = this.pending.get(response.requestId)
    if (!pending) return
    this.pending.delete(response.requestId)
    clearTimeout(pending.timer)
    pending.resolve(response)
  }

  constructor(
    generation: number,
    private readonly resolveSource: () => Promise<GameWindowDesktopSourceInfo | null> = resolveGameWindowDesktopSource,
    private readonly assetRoot = app.getAppPath(),
  ) {
    this.generation = generation
    const partition = `scalpel-game-capture-${process.pid}-${generation}-${randomUUID()}`
    const captureSession = session.fromPartition(partition, { cache: false })
    captureSession.setDisplayMediaRequestHandler(
      (_request, callback) => {
        const source = this.currentSource?.source
        callback(source ? { video: source } : {})
      },
      { useSystemPicker: false },
    )

    this.window = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      paintWhenInitiallyHidden: true,
      skipTaskbar: true,
      webPreferences: {
        preload: join(this.assetRoot, 'out/preload/index.js'),
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.readyTimer = setTimeout(() => {
      this.rejectReady(
        new CaptureStreamSessionError(
          sessionFailure(
            'session-crashed',
            'capture-session',
            'The isolated capture renderer did not become ready in time.',
            'TimeoutError',
          ),
          true,
        ),
      )
    }, RENDERER_READY_TIMEOUT_MS)

    ipcMain.on(CAPTURE_BROKER_READY_EVENT, this.onReadyMessage)
    ipcMain.on(CAPTURE_BROKER_RESPONSE_EVENT, this.onResponseMessage)
    this.window.webContents.on('render-process-gone', (_event, details) => {
      const error = new CaptureStreamSessionError(
        sessionFailure(
          'session-crashed',
          'capture-session',
          `The isolated capture renderer exited: ${details.reason}.`,
          'RenderProcessGone',
        ),
        true,
      )
      this.rejectAll(error)
      for (const handler of this.fatalHandlers) handler(error)
    })
    this.window.on('closed', () => {
      if (this.destroyed) return
      const error = new CaptureStreamSessionError(
        sessionFailure(
          'session-crashed',
          'capture-session',
          'The isolated capture renderer closed unexpectedly.',
          'WindowClosed',
        ),
        true,
      )
      this.rejectAll(error)
      for (const handler of this.fatalHandlers) handler(error)
    })

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/capture-broker.html`)
    } else {
      void this.window.loadFile(join(this.assetRoot, 'out/renderer/capture-broker.html'))
    }
  }

  get sourceId(): string | undefined {
    return this.currentSource?.sourceId
  }

  get frameSize(): { width: number; height: number } | undefined {
    return this.currentFrameSize
  }

  get gameSize(): { width: number; height: number } | undefined {
    const size = this.currentSource?.gameSize
    return size ? { width: size.w, height: size.h } : undefined
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }

  private async request(command: CaptureBrokerCommand, timeoutMs: number): Promise<CaptureBrokerResponse> {
    await this.ready
    if (this.destroyed || this.window.isDestroyed()) {
      throw new CaptureStreamSessionError(
        sessionFailure(
          'session-crashed',
          'capture-session',
          'The isolated capture session is no longer available.',
          'InvalidStateError',
        ),
        true,
      )
    }
    return new Promise<CaptureBrokerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.requestId)
        reject(
          new CaptureStreamSessionError(
            sessionFailure(
              'session-crashed',
              'capture-session',
              `The isolated capture renderer timed out during ${command.type}.`,
              'TimeoutError',
            ),
            true,
          ),
        )
      }, timeoutMs)
      this.pending.set(command.requestId, { resolve, reject, timer })
      this.window.webContents.send(CAPTURE_BROKER_COMMAND_EVENT, command)
    })
  }

  async start(): Promise<void> {
    const source = await this.resolveSource()
    if (!source) {
      throw new CaptureStreamSessionError(
        sessionFailure(
          'source-unresolved',
          'resolve-source',
          'Scalpel could not resolve the Path of Exile window stream source.',
        ),
        false,
      )
    }
    this.currentSource = source
    const response = await this.request(
      {
        requestId: randomUUID(),
        type: 'start',
        gameSize: { width: source.gameSize.w, height: source.gameSize.h },
        displayScaleFactor: source.displayScaleFactor,
      },
      START_TIMEOUT_MS,
    )
    if (response.type === 'failed') throw responseError(response)
    if (response.type !== 'started') {
      throw new CaptureStreamSessionError(
        sessionFailure(
          'session-crashed',
          'capture-session',
          `Unexpected capture renderer response to start: ${response.type}.`,
        ),
        true,
      )
    }
    this.currentFrameSize = response.frameSize
  }

  async capture(region?: GameRect): Promise<GameCapture> {
    const source = this.currentSource
    if (!source) {
      throw new CaptureStreamSessionError(
        sessionFailure(
          'session-crashed',
          'capture-session',
          'The isolated capture session has not been started.',
          'InvalidStateError',
        ),
        true,
      )
    }
    const response = await this.request(
      {
        requestId: randomUUID(),
        type: 'capture',
        region,
        gameSize: { width: source.gameSize.w, height: source.gameSize.h },
        displayScaleFactor: source.displayScaleFactor,
      },
      CAPTURE_TIMEOUT_MS,
    )
    if (response.type === 'failed') throw responseError(response)
    if (response.type !== 'captured') {
      throw new CaptureStreamSessionError(
        sessionFailure(
          'session-crashed',
          'capture-session',
          `Unexpected capture renderer response to capture: ${response.type}.`,
        ),
        true,
      )
    }
    const pixels =
      response.pixels instanceof Uint8ClampedArray ? response.pixels : new Uint8ClampedArray(response.pixels)
    return {
      pixels,
      width: response.width,
      height: response.height,
      origin: response.origin,
      gameSize: { width: source.gameSize.w, height: source.gameSize.h },
      scale: response.scale,
    }
  }

  async stop(): Promise<void> {
    if (this.destroyed || this.window.isDestroyed()) return
    try {
      await this.request({ requestId: randomUUID(), type: 'stop' }, STOP_TIMEOUT_MS)
    } catch {
      // Teardown is best-effort; destroy/reset remains authoritative.
    }
    this.currentSource = undefined
    this.currentFrameSize = undefined
  }

  onFatal(handler: (error: CaptureStreamSessionError) => void): () => void {
    this.fatalHandlers.add(handler)
    return () => this.fatalHandlers.delete(handler)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    clearTimeout(this.readyTimer)
    ipcMain.removeListener(CAPTURE_BROKER_READY_EVENT, this.onReadyMessage)
    ipcMain.removeListener(CAPTURE_BROKER_RESPONSE_EVENT, this.onResponseMessage)
    this.rejectAll(new Error('The isolated capture session was destroyed.'))
    this.fatalHandlers.clear()
    if (!this.window.isDestroyed()) this.window.destroy()
  }
}
