import { deserialize, serialize } from 'node:v8'
import type { Socket } from 'node:net'
import type { GameCapture, GameCaptureStreamFailure, GameRect } from '../../plugin-sdk/src/types'

const FRAME_HEADER_BYTES = 4
const MAX_FRAME_BYTES = 64 * 1024 * 1024

export interface CaptureProcessSource {
  sourceId: string
  sourceName: string
  gameSize: { width: number; height: number }
  displayScaleFactor: number
}

export type CaptureProcessCommand =
  | {
      requestId: string
      type: 'start'
      generation: number
      source: CaptureProcessSource
    }
  | {
      requestId: string
      type: 'capture'
      region?: GameRect
    }
  | {
      requestId: string
      type: 'stop'
    }
  | {
      requestId: string
      type: 'shutdown'
    }

export type CaptureProcessResponse =
  | {
      requestId: string
      type: 'started'
      sourceId: string
      frameSize: { width: number; height: number }
      gameSize: { width: number; height: number }
    }
  | ({
      requestId: string
      type: 'captured'
    } & GameCapture)
  | {
      requestId: string
      type: 'stopped' | 'shutdown'
    }
  | {
      requestId: string
      type: 'failed'
      failure: GameCaptureStreamFailure
    }
  | {
      type: 'fatal'
      failure: GameCaptureStreamFailure
    }

export type CaptureProcessHello = {
  type: 'hello'
  token: string
  pid: number
}

export type CaptureProcessMessage = CaptureProcessCommand | CaptureProcessResponse | CaptureProcessHello

export function encodeCaptureProcessMessage(message: CaptureProcessMessage): Buffer {
  const payload = serialize(message)
  if (payload.byteLength > MAX_FRAME_BYTES) {
    throw new Error(`Capture process message exceeds ${MAX_FRAME_BYTES} bytes.`)
  }
  const frame = Buffer.allocUnsafe(FRAME_HEADER_BYTES + payload.byteLength)
  frame.writeUInt32BE(payload.byteLength, 0)
  payload.copy(frame, FRAME_HEADER_BYTES)
  return frame
}

export class CaptureProcessMessageDecoder {
  private buffered: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): CaptureProcessMessage[] {
    this.buffered = this.buffered.byteLength === 0 ? chunk : Buffer.concat([this.buffered, chunk])
    const messages: CaptureProcessMessage[] = []
    while (this.buffered.byteLength >= FRAME_HEADER_BYTES) {
      const length = this.buffered.readUInt32BE(0)
      if (length <= 0 || length > MAX_FRAME_BYTES) {
        throw new Error(`Invalid capture process message length: ${length}.`)
      }
      const frameLength = FRAME_HEADER_BYTES + length
      if (this.buffered.byteLength < frameLength) break
      messages.push(deserialize(this.buffered.subarray(FRAME_HEADER_BYTES, frameLength)) as CaptureProcessMessage)
      this.buffered = this.buffered.subarray(frameLength)
    }
    return messages
  }
}

export class CaptureProcessChannel {
  private readonly decoder = new CaptureProcessMessageDecoder()

  constructor(
    private readonly socket: Socket,
    onMessage: (message: CaptureProcessMessage) => void,
    onProtocolError: (error: Error) => void,
  ) {
    socket.on('data', (chunk: Buffer) => {
      try {
        for (const message of this.decoder.push(chunk)) onMessage(message)
      } catch (caught) {
        const error = caught instanceof Error ? caught : new Error(String(caught))
        onProtocolError(error)
        socket.destroy(error)
      }
    })
  }

  send(message: CaptureProcessMessage): void {
    this.socket.write(encodeCaptureProcessMessage(message))
  }

  destroy(): void {
    this.socket.destroy()
  }
}
