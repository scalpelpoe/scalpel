import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import type { GameCapture, GameCaptureStreamFailure, GameRect } from '../../plugin-sdk/src/types'
import { resolveGameWindowDesktopSource, type GameWindowDesktopSourceInfo } from '../handlers/screen-source'
import {
  CaptureProcessChannel,
  type CaptureProcessCommand,
  type CaptureProcessHello,
  type CaptureProcessMessage,
  type CaptureProcessResponse,
} from './process-protocol'
import { CaptureStreamSessionError, type CaptureStreamSession } from './stream-session'

const CONNECT_TIMEOUT_MS = 8_000
const START_TIMEOUT_MS = 8_000
const CAPTURE_TIMEOUT_MS = 3_000
const STOP_TIMEOUT_MS = 1_500

type PendingRequest = {
  resolve: (response: CaptureProcessResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface CaptureProcessTransport {
  request(command: CaptureProcessCommand, timeoutMs: number): Promise<CaptureProcessResponse>
  onFatal(handler: (error: CaptureStreamSessionError) => void): () => void
  destroy(): void
}

export interface ProcessCaptureStreamSessionDeps {
  resolveSource: () => Promise<GameWindowDesktopSourceInfo | null>
  createTransport: (generation: number) => Promise<CaptureProcessTransport>
}

function sessionFailure(
  kind: GameCaptureStreamFailure['kind'],
  stage: GameCaptureStreamFailure['stage'],
  message: string,
  name?: string,
): GameCaptureStreamFailure {
  return { kind, stage, message, ...(name ? { name } : {}) }
}

function processFailure(message: string, name = 'CaptureProcessError'): CaptureStreamSessionError {
  return new CaptureStreamSessionError(sessionFailure('session-crashed', 'capture-session', message, name), true)
}

function responseError(response: Extract<CaptureProcessResponse, { type: 'failed' }>): CaptureStreamSessionError {
  return new CaptureStreamSessionError(response.failure, response.failure.kind !== 'source-unresolved')
}

class NodeCaptureProcessTransport implements CaptureProcessTransport {
  private readonly pending = new Map<string, PendingRequest>()
  private readonly fatalHandlers = new Set<(error: CaptureStreamSessionError) => void>()
  private readonly server: Server
  private readonly token = randomUUID()
  private readonly pipeName = `\\\\.\\pipe\\scalpel-capture-${process.pid}-${randomUUID()}`
  private readonly workerUserData = join(tmpdir(), `scalpel-capture-${process.pid}-${randomUUID()}`)
  private child: ChildProcess | undefined
  private socket: Socket | undefined
  private channel: CaptureProcessChannel | undefined
  private connectTimer: ReturnType<typeof setTimeout> | undefined
  private destroyed = false
  private failed = false
  private serverClosing = false
  private readyResolve!: () => void
  private readyReject!: (error: Error) => void
  private readonly ready: Promise<void>

  constructor(private readonly generation: number) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    this.server = createServer((socket) => this.accept(socket))
    this.server.on('error', (caught) => this.failConnection(caught))
  }

  async launch(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('listening', resolve)
      this.server.once('error', reject)
      this.server.listen(this.pipeName)
    })
    if (this.destroyed) throw processFailure('The capture process transport was destroyed before launch.')

    this.connectTimer = setTimeout(() => {
      this.failConnection(processFailure('The isolated capture process did not connect in time.', 'TimeoutError'))
    }, CONNECT_TIMEOUT_MS)
    const childArgs = app.isPackaged ? ['--scalpel-capture-process'] : [app.getAppPath(), '--scalpel-capture-process']
    this.child = spawn(process.execPath, childArgs, {
      env: {
        ...process.env,
        SCALPEL_CAPTURE_PIPE: this.pipeName,
        SCALPEL_CAPTURE_TOKEN: this.token,
        SCALPEL_CAPTURE_GENERATION: String(this.generation),
        SCALPEL_CAPTURE_ASSET_ROOT: app.isPackaged ? app.getAppPath() : resolve(__dirname, '../../..'),
        SCALPEL_CAPTURE_USER_DATA: this.workerUserData,
      },
      stdio: 'ignore',
      windowsHide: true,
    })
    this.child.once('error', (caught) => this.failConnection(caught))
    this.child.once('exit', (code, signal) => {
      void rm(this.workerUserData, { recursive: true, force: true }).catch(() => undefined)
      if (this.destroyed) return
      const suffix = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`
      this.failConnection(processFailure(`The isolated capture process exited with ${suffix}.`, 'ProcessExit'))
    })
    await this.ready
  }

  private accept(socket: Socket): void {
    if (this.destroyed || this.socket) {
      socket.destroy()
      return
    }
    this.socket = socket
    this.channel = new CaptureProcessChannel(
      socket,
      (message) => this.handleMessage(message),
      (error) => this.failConnection(error),
    )
    socket.once('error', (caught) => this.failConnection(caught))
    socket.once('close', () => {
      if (!this.destroyed) this.failConnection(processFailure('The isolated capture process connection closed.'))
    })
  }

  private handleMessage(message: CaptureProcessMessage): void {
    if (message.type === 'hello') {
      this.handleHello(message)
      return
    }
    if (message.type === 'fatal') {
      const error = new CaptureStreamSessionError(message.failure, true)
      this.rejectAll(error)
      for (const handler of this.fatalHandlers) handler(error)
      return
    }
    if (!('requestId' in message)) return
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    this.pending.delete(message.requestId)
    clearTimeout(pending.timer)
    pending.resolve(message as CaptureProcessResponse)
  }

  private handleHello(message: CaptureProcessHello): void {
    if (message.token !== this.token) {
      this.failConnection(processFailure('The isolated capture process failed authentication.', 'AuthenticationError'))
      return
    }
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.connectTimer = undefined
    this.closeServer()
    this.readyResolve()
  }

  private closeServer(): void {
    if (this.serverClosing) return
    this.serverClosing = true
    try {
      this.server.close()
    } catch {
      // A failed or pre-empted launch may close before listen completes.
    }
  }

  private failConnection(caught: unknown): void {
    if (this.destroyed || this.failed) return
    this.failed = true
    const error =
      caught instanceof CaptureStreamSessionError
        ? caught
        : processFailure(caught instanceof Error ? caught.message : String(caught))
    this.readyReject(error)
    this.rejectAll(error)
    for (const handler of this.fatalHandlers) handler(error)
    this.closeServer()
    this.channel?.destroy()
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) this.child.kill()
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  async request(command: CaptureProcessCommand, timeoutMs: number): Promise<CaptureProcessResponse> {
    await this.ready
    if (this.destroyed || this.failed || !this.channel) {
      throw processFailure('The isolated capture process is no longer available.', 'InvalidStateError')
    }
    return new Promise<CaptureProcessResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.requestId)
        reject(processFailure(`The isolated capture process timed out during ${command.type}.`, 'TimeoutError'))
      }, timeoutMs)
      this.pending.set(command.requestId, { resolve, reject, timer })
      this.channel?.send(command)
    })
  }

  onFatal(handler: (error: CaptureStreamSessionError) => void): () => void {
    this.fatalHandlers.add(handler)
    return () => this.fatalHandlers.delete(handler)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.connectTimer) clearTimeout(this.connectTimer)
    this.connectTimer = undefined
    this.closeServer()
    this.channel?.destroy()
    this.channel = undefined
    this.socket = undefined
    this.rejectAll(processFailure('The isolated capture process was destroyed.'))
    this.fatalHandlers.clear()
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) this.child.kill()
    this.child = undefined
  }
}

async function createDefaultTransport(generation: number): Promise<CaptureProcessTransport> {
  const transport = new NodeCaptureProcessTransport(generation)
  await transport.launch()
  return transport
}

export class ProcessCaptureStreamSession implements CaptureStreamSession {
  readonly generation: number

  private readonly deps: ProcessCaptureStreamSessionDeps
  private readonly fatalHandlers = new Set<(error: CaptureStreamSessionError) => void>()
  private transport: CaptureProcessTransport | undefined
  private unsubscribeFatal: (() => void) | undefined
  private currentSourceId: string | undefined
  private currentFrameSize: { width: number; height: number } | undefined
  private currentGameSize: { width: number; height: number } | undefined
  private destroyed = false

  constructor(generation: number, deps: Partial<ProcessCaptureStreamSessionDeps> = {}) {
    this.generation = generation
    this.deps = {
      resolveSource: resolveGameWindowDesktopSource,
      createTransport: createDefaultTransport,
      ...deps,
    }
  }

  get sourceId(): string | undefined {
    return this.currentSourceId
  }

  get frameSize(): { width: number; height: number } | undefined {
    return this.currentFrameSize
  }

  get gameSize(): { width: number; height: number } | undefined {
    return this.currentGameSize
  }

  private async ensureTransport(): Promise<CaptureProcessTransport> {
    if (this.destroyed) {
      throw processFailure('The isolated capture process session was destroyed.', 'InvalidStateError')
    }
    if (this.transport) return this.transport
    const transport = await this.deps.createTransport(this.generation)
    if (this.destroyed) {
      transport.destroy()
      throw processFailure('The isolated capture process session was destroyed.', 'InvalidStateError')
    }
    this.transport = transport
    this.unsubscribeFatal = transport.onFatal((error) => {
      for (const handler of this.fatalHandlers) handler(error)
    })
    return transport
  }

  async start(): Promise<void> {
    const resolved = await this.deps.resolveSource()
    if (!resolved) {
      throw new CaptureStreamSessionError(
        sessionFailure(
          'source-unresolved',
          'resolve-source',
          'Scalpel could not resolve the Path of Exile window stream source.',
        ),
        false,
      )
    }
    const transport = await this.ensureTransport()
    const response = await transport.request(
      {
        requestId: randomUUID(),
        type: 'start',
        generation: this.generation,
        source: {
          sourceId: resolved.sourceId,
          sourceName: resolved.source.name,
          gameSize: { width: resolved.gameSize.w, height: resolved.gameSize.h },
          displayScaleFactor: resolved.displayScaleFactor,
        },
      },
      START_TIMEOUT_MS,
    )
    if (response.type === 'failed') throw responseError(response)
    if (response.type !== 'started') {
      throw processFailure(`Unexpected capture process response to start: ${response.type}.`)
    }
    this.currentSourceId = response.sourceId
    this.currentFrameSize = response.frameSize
    this.currentGameSize = response.gameSize
  }

  async capture(region?: GameRect): Promise<GameCapture> {
    const transport = await this.ensureTransport()
    const response = await transport.request({ requestId: randomUUID(), type: 'capture', region }, CAPTURE_TIMEOUT_MS)
    if (response.type === 'failed') throw responseError(response)
    if (response.type !== 'captured') {
      throw processFailure(`Unexpected capture process response to capture: ${response.type}.`)
    }
    return {
      pixels: response.pixels instanceof Uint8ClampedArray ? response.pixels : new Uint8ClampedArray(response.pixels),
      width: response.width,
      height: response.height,
      origin: response.origin,
      gameSize: response.gameSize,
      scale: response.scale,
    }
  }

  async stop(): Promise<void> {
    if (this.destroyed || !this.transport) return
    try {
      await this.transport.request({ requestId: randomUUID(), type: 'stop' }, STOP_TIMEOUT_MS)
    } catch {
      // Teardown is best-effort; destroy/reset remains authoritative.
    }
    this.currentSourceId = undefined
    this.currentFrameSize = undefined
    this.currentGameSize = undefined
  }

  onFatal(handler: (error: CaptureStreamSessionError) => void): () => void {
    this.fatalHandlers.add(handler)
    return () => this.fatalHandlers.delete(handler)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.unsubscribeFatal?.()
    this.unsubscribeFatal = undefined
    this.transport?.destroy()
    this.transport = undefined
    this.fatalHandlers.clear()
  }
}
