import { createConnection } from 'node:net'
import { app, desktopCapturer } from 'electron'
import type { GameCaptureStreamFailure } from '../../plugin-sdk/src/types'
import type { GameWindowDesktopSourceInfo } from '../handlers/screen-source'
import {
  CaptureProcessChannel,
  type CaptureProcessCommand,
  type CaptureProcessMessage,
  type CaptureProcessSource,
} from './process-protocol'
import { CaptureStreamSessionError, ElectronCaptureStreamSession } from './stream-session'

function failureFrom(caught: unknown): GameCaptureStreamFailure {
  if (caught instanceof CaptureStreamSessionError) return caught.failure
  const error = caught instanceof Error ? caught : new Error(String(caught))
  return {
    kind: 'session-crashed',
    stage: 'capture-session',
    message: error.message,
    ...(error.name ? { name: error.name } : {}),
  }
}

async function resolveSource(spec: CaptureProcessSource): Promise<GameWindowDesktopSourceInfo | null> {
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    thumbnailSize: { width: 1, height: 1 },
    fetchWindowIcons: false,
  })
  const source =
    sources.find((candidate) => candidate.id === spec.sourceId) ??
    sources.find((candidate) => candidate.name === spec.sourceName)
  if (!source) return null
  return {
    source,
    sourceId: source.id,
    gameSize: { w: spec.gameSize.width, h: spec.gameSize.height },
    displayScaleFactor: spec.displayScaleFactor,
  }
}

export async function runCaptureProcessChild(): Promise<void> {
  const pipeName = process.env.SCALPEL_CAPTURE_PIPE
  const token = process.env.SCALPEL_CAPTURE_TOKEN
  const assetRoot = process.env.SCALPEL_CAPTURE_ASSET_ROOT
  const workerUserData = process.env.SCALPEL_CAPTURE_USER_DATA
  if (!pipeName || !token || !assetRoot || !workerUserData) {
    app.exit(2)
    return
  }

  app.setPath('userData', workerUserData)
  await app.whenReady()

  const socket = createConnection(pipeName)
  let captureSession: ElectronCaptureStreamSession | undefined
  let unsubscribeFatal: (() => void) | undefined
  let closing = false
  let queue = Promise.resolve()

  const exit = async (code: number): Promise<void> => {
    if (closing) return
    closing = true
    unsubscribeFatal?.()
    unsubscribeFatal = undefined
    if (captureSession) {
      await captureSession.stop()
      captureSession.destroy()
      captureSession = undefined
    }
    channel.destroy()
    app.exit(code)
  }

  const respondFailed = (requestId: string, caught: unknown): void => {
    channel.send({ requestId, type: 'failed', failure: failureFrom(caught) })
  }

  const handleCommand = async (command: CaptureProcessCommand): Promise<void> => {
    if (command.type === 'start') {
      unsubscribeFatal?.()
      captureSession?.destroy()
      captureSession = new ElectronCaptureStreamSession(
        command.generation,
        () => resolveSource(command.source),
        assetRoot,
      )
      unsubscribeFatal = captureSession.onFatal((error) => {
        channel.send({ type: 'fatal', failure: error.failure })
      })
      try {
        await captureSession.start()
        const sourceId = captureSession.sourceId
        const frameSize = captureSession.frameSize
        const gameSize = captureSession.gameSize
        if (!sourceId || !frameSize || !gameSize) {
          throw new Error('The capture worker started without complete stream geometry.')
        }
        channel.send({ requestId: command.requestId, type: 'started', sourceId, frameSize, gameSize })
      } catch (caught) {
        respondFailed(command.requestId, caught)
      }
      return
    }

    if (command.type === 'capture') {
      if (!captureSession) {
        respondFailed(command.requestId, new Error('The capture worker has not started a stream.'))
        return
      }
      try {
        const capture = await captureSession.capture(command.region)
        channel.send({ requestId: command.requestId, type: 'captured', ...capture })
      } catch (caught) {
        respondFailed(command.requestId, caught)
      }
      return
    }

    if (command.type === 'stop') {
      if (captureSession) await captureSession.stop()
      channel.send({ requestId: command.requestId, type: 'stopped' })
      return
    }

    channel.send({ requestId: command.requestId, type: 'shutdown' })
    await exit(0)
  }

  const handleMessage = (message: CaptureProcessMessage): void => {
    if (message.type === 'hello' || message.type === 'fatal' || message.type === 'failed') return
    if (!('requestId' in message)) return
    const command = message as CaptureProcessCommand
    queue = queue.then(
      () => handleCommand(command),
      () => handleCommand(command),
    )
  }

  const channel = new CaptureProcessChannel(socket, handleMessage, () => {
    void exit(3)
  })

  socket.once('connect', () => {
    channel.send({ type: 'hello', token, pid: process.pid })
  })
  socket.once('close', () => {
    void exit(0)
  })
  socket.once('error', () => {
    void exit(3)
  })

  app.on('before-quit', () => {
    if (!closing) void exit(0)
  })
  app.on('window-all-closed', () => {
    // The hidden renderer is owned by ElectronCaptureStreamSession.
  })
}
