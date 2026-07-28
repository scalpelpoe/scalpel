import { describe, expect, it, vi } from 'vitest'
import type { GameWindowDesktopSourceInfo } from '../handlers/screen-source'
import type { CaptureProcessCommand, CaptureProcessResponse } from './process-protocol'
import { type CaptureProcessTransport, ProcessCaptureStreamSession } from './process-session'
import { CaptureStreamSessionError } from './stream-session'

function source(): GameWindowDesktopSourceInfo {
  return {
    source: { id: 'window:42:0', name: 'Path of Exile 2' } as Electron.DesktopCapturerSource,
    sourceId: 'window:42:0',
    gameSize: { w: 1920, h: 1080 },
    displayScaleFactor: 1.25,
  }
}

function transport(
  responder: (command: CaptureProcessCommand) => CaptureProcessResponse | Promise<CaptureProcessResponse>,
): CaptureProcessTransport {
  return {
    request: vi.fn(async (command: CaptureProcessCommand) => responder(command)),
    onFatal: vi.fn(() => () => undefined),
    destroy: vi.fn(),
  }
}

describe('ProcessCaptureStreamSession', () => {
  it('opens and captures through the isolated process transport', async () => {
    const active = transport((command) => {
      if (command.type === 'start') {
        return {
          requestId: command.requestId,
          type: 'started',
          sourceId: 'window:42:0',
          frameSize: { width: 1920, height: 1080 },
          gameSize: { width: 1920, height: 1080 },
        }
      }
      if (command.type === 'capture') {
        return {
          requestId: command.requestId,
          type: 'captured',
          pixels: new Uint8ClampedArray([10, 20, 30, 255]),
          width: 1,
          height: 1,
          origin: { x: 5, y: 6 },
          gameSize: { width: 1920, height: 1080 },
          scale: 1,
        }
      }
      return { requestId: command.requestId, type: command.type === 'shutdown' ? 'shutdown' : 'stopped' }
    })
    const createTransport = vi.fn(async () => active)
    const captureSession = new ProcessCaptureStreamSession(7, {
      resolveSource: async () => source(),
      createTransport,
    })

    await captureSession.start()
    expect(createTransport).toHaveBeenCalledWith(7)
    expect(active.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'start',
        generation: 7,
        source: {
          sourceId: 'window:42:0',
          sourceName: 'Path of Exile 2',
          gameSize: { width: 1920, height: 1080 },
          displayScaleFactor: 1.25,
        },
      }),
      8_000,
    )
    expect(captureSession.sourceId).toBe('window:42:0')
    expect(captureSession.frameSize).toEqual({ width: 1920, height: 1080 })

    const captured = await captureSession.capture({ x: 5, y: 6, width: 1, height: 1 })
    expect(Array.from(captured.pixels)).toEqual([10, 20, 30, 255])
    expect(captured.origin).toEqual({ x: 5, y: 6 })

    await captureSession.stop()
    captureSession.destroy()
    expect(active.destroy).toHaveBeenCalledOnce()
  })

  it('keeps a parent source miss cheap and does not launch a worker', async () => {
    const createTransport = vi.fn()
    const captureSession = new ProcessCaptureStreamSession(1, {
      resolveSource: async () => null,
      createTransport,
    })

    const error = await captureSession.start().catch((caught) => caught)
    expect(error).toBeInstanceOf(CaptureStreamSessionError)
    expect(error).toMatchObject({
      heavy: false,
      failure: { kind: 'source-unresolved', stage: 'resolve-source' },
    })
    expect(createTransport).not.toHaveBeenCalled()
  })

  it('preserves a child getDisplayMedia failure as a heavy stream error', async () => {
    const active = transport((command) => ({
      requestId: command.requestId,
      type: 'failed',
      failure: {
        kind: 'stream-start-failed',
        stage: 'get-display-media',
        name: 'NotReadableError',
        message: 'Could not start video source',
      },
    }))
    const captureSession = new ProcessCaptureStreamSession(1, {
      resolveSource: async () => source(),
      createTransport: async () => active,
    })

    const error = await captureSession.start().catch((caught) => caught)
    expect(error).toBeInstanceOf(CaptureStreamSessionError)
    expect(error).toMatchObject({
      heavy: true,
      failure: {
        kind: 'stream-start-failed',
        stage: 'get-display-media',
        name: 'NotReadableError',
      },
    })
  })
})
