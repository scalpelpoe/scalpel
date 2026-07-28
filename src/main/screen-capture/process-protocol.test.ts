import { describe, expect, it } from 'vitest'
import {
  CaptureProcessMessageDecoder,
  encodeCaptureProcessMessage,
  type CaptureProcessResponse,
} from './process-protocol'

describe('capture process framing', () => {
  it('preserves typed frame pixels across split transport chunks', () => {
    const message: CaptureProcessResponse = {
      requestId: 'capture-1',
      type: 'captured',
      pixels: new Uint8ClampedArray([1, 2, 3, 255, 5, 6, 7, 255]),
      width: 2,
      height: 1,
      origin: { x: 10, y: 20 },
      gameSize: { width: 1920, height: 1080 },
      scale: 1,
    }
    const encoded = encodeCaptureProcessMessage(message)
    const decoder = new CaptureProcessMessageDecoder()

    expect(decoder.push(encoded.subarray(0, 3))).toEqual([])
    expect(decoder.push(encoded.subarray(3, 11))).toEqual([])
    const decoded = decoder.push(encoded.subarray(11))

    expect(decoded).toHaveLength(1)
    expect(decoded[0]).toMatchObject({
      requestId: 'capture-1',
      type: 'captured',
      width: 2,
      height: 1,
      origin: { x: 10, y: 20 },
      gameSize: { width: 1920, height: 1080 },
      scale: 1,
    })
    expect((decoded[0] as CaptureProcessResponse & { type: 'captured' }).pixels).toBeInstanceOf(Uint8ClampedArray)
    expect(Array.from((decoded[0] as CaptureProcessResponse & { type: 'captured' }).pixels)).toEqual([
      1, 2, 3, 255, 5, 6, 7, 255,
    ])
  })

  it('decodes multiple messages delivered in one chunk', () => {
    const first = encodeCaptureProcessMessage({ type: 'hello', token: 'token', pid: 12 })
    const second = encodeCaptureProcessMessage({ requestId: 'stop-1', type: 'stopped' })

    expect(new CaptureProcessMessageDecoder().push(Buffer.concat([first, second]))).toEqual([
      { type: 'hello', token: 'token', pid: 12 },
      { requestId: 'stop-1', type: 'stopped' },
    ])
  })

  it('rejects an oversized declared message before buffering its payload', () => {
    const invalid = Buffer.alloc(4)
    invalid.writeUInt32BE(64 * 1024 * 1024 + 1)

    expect(() => new CaptureProcessMessageDecoder().push(invalid)).toThrow('Invalid capture process message length')
  })
})
