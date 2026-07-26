import { describe, expect, it, vi } from 'vitest'
import type { GameCapture } from '../../plugin-sdk/src/types'
import { GameCaptureStreamBroker } from './stream-broker'
import { CaptureStreamSessionError, type CaptureStreamSession } from './stream-session'

function capture(): GameCapture {
  return {
    pixels: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
    origin: { x: 0, y: 0 },
    gameSize: { width: 1920, height: 1080 },
    scale: 1,
  }
}

function session(
  generation: number,
  options: {
    start?: () => Promise<void>
    capture?: () => Promise<GameCapture>
  } = {},
): CaptureStreamSession {
  return {
    generation,
    sourceId: `window:poe:${generation}`,
    frameSize: { width: 3840, height: 2160 },
    gameSize: { width: 1920, height: 1080 },
    start: options.start ?? vi.fn(async () => undefined),
    capture: options.capture ?? vi.fn(async () => capture()),
    stop: vi.fn(async () => undefined),
    destroy: vi.fn(),
    onFatal: vi.fn(() => () => {}),
  }
}

function heavy(message: string): CaptureStreamSessionError {
  return new CaptureStreamSessionError(
    {
      kind: 'stream-start-failed',
      stage: 'get-display-media',
      name: 'NotReadableError',
      message,
    },
    true,
  )
}

function sourceMiss(): CaptureStreamSessionError {
  return new CaptureStreamSessionError(
    {
      kind: 'source-unresolved',
      stage: 'resolve-source',
      message: 'source unavailable',
    },
    false,
  )
}

describe('GameCaptureStreamBroker', () => {
  it('recovers one heavy media failure in a fresh isolated session', async () => {
    const first = session(1, { start: vi.fn(async () => Promise.reject(heavy('first failed'))) })
    const second = session(2)
    const createSession = vi.fn((generation: number) => (generation === 1 ? first : second))
    const broker = new GameCaptureStreamBroker({
      hasGameFocus: () => true,
      createSession,
    })

    const result = await broker.capture('plugin', { x: 50, y: 148, width: 501, height: 545 })

    expect(result.capture).toEqual(capture())
    expect(result.status).toMatchObject({
      state: 'ready',
      ready: true,
      sessionGeneration: 2,
      recoveryCount: 1,
      openFailures: 0,
      automaticRetrySuppressed: false,
    })
    expect(first.destroy).toHaveBeenCalledOnce()
    expect(createSession).toHaveBeenCalledTimes(2)
    await broker.dispose()
  })

  it('opens a shared circuit breaker after two heavy session failures', async () => {
    const createSession = vi.fn((generation: number) =>
      session(generation, { start: vi.fn(async () => Promise.reject(heavy(`failed ${generation}`))) }),
    )
    const broker = new GameCaptureStreamBroker({
      hasGameFocus: () => true,
      createSession,
    })

    const result = await broker.capture('plugin')
    expect(result.capture).toBeNull()
    expect(result.status).toMatchObject({
      state: 'blocked',
      ready: false,
      sessionGeneration: 2,
      recoveryCount: 1,
      openFailures: 2,
      automaticRetrySuppressed: true,
      lastFailure: {
        kind: 'stream-start-failed',
        name: 'NotReadableError',
        message: 'failed 2',
      },
    })

    await broker.capture('plugin')
    expect(createSession).toHaveBeenCalledTimes(2)
    await broker.dispose()
  })

  it('uses an explicit reset to leave blocked state and create a fresh session', async () => {
    const createSession = vi.fn((generation: number) => {
      if (generation <= 2) {
        return session(generation, { start: vi.fn(async () => Promise.reject(heavy(`failed ${generation}`))) })
      }
      return session(generation)
    })
    const broker = new GameCaptureStreamBroker({
      hasGameFocus: () => true,
      createSession,
    })
    await broker.capture('plugin')

    expect(await broker.reset('plugin')).toMatchObject({
      state: 'idle',
      openFailures: 0,
      automaticRetrySuppressed: false,
    })
    const recovered = await broker.capture('plugin')
    expect(recovered.capture).toEqual(capture())
    expect(recovered.status).toMatchObject({
      state: 'ready',
      sessionGeneration: 3,
    })
    await broker.dispose()
  })

  it('treats source resolution misses as cheap cooldowns, not heavy failures', async () => {
    vi.useFakeTimers()
    try {
      const first = session(1, { start: vi.fn(async () => Promise.reject(sourceMiss())) })
      const secondStart = vi.fn(async () => undefined)
      first.start = vi.fn().mockRejectedValueOnce(sourceMiss()).mockImplementation(secondStart)
      const broker = new GameCaptureStreamBroker({
        hasGameFocus: () => true,
        createSession: () => first,
        now: () => Date.now(),
      })

      const missed = await broker.capture('plugin')
      expect(missed.status).toMatchObject({
        state: 'cooldown',
        sourceResolveMisses: 1,
        openFailures: 0,
        automaticRetrySuppressed: false,
      })
      await broker.capture('plugin')
      expect(first.start).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(500)
      const recovered = await broker.capture('plugin')
      expect(recovered.capture).toEqual(capture())
      expect(recovered.status.state).toBe('ready')
      await broker.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops the stream while PoE is unfocused and releases the last plugin lease', async () => {
    let focused = true
    const active = session(1)
    const broker = new GameCaptureStreamBroker({
      hasGameFocus: () => focused,
      createSession: () => active,
    })
    await broker.capture('plugin')

    focused = false
    const suspended = await broker.capture('plugin')
    expect(suspended.capture).toBeNull()
    expect(suspended.status.state).toBe('suspended')
    expect(active.stop).toHaveBeenCalledOnce()

    focused = true
    await broker.capture('plugin')
    await broker.release('plugin')
    expect(active.stop).toHaveBeenCalledTimes(2)
    await broker.dispose()
  })
})
