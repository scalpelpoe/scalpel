import { describe, expect, it, vi } from 'vitest'
import { createStatsGate } from './stats-gate'

describe('createStatsGate', () => {
  it('reports not ready, loads once, then triggers onLoaded after the load resolves', async () => {
    let loaded = false
    let resolve!: () => void
    const load = vi.fn(
      () =>
        new Promise<void>((r) => {
          resolve = () => {
            loaded = true
            r()
          }
        }),
    )
    const onLoaded = vi.fn()
    const gate = createStatsGate({ isLoaded: () => loaded, load, onLoaded })
    expect(gate()).toBe(false)
    expect(gate()).toBe(false)
    expect(load).toHaveBeenCalledTimes(1)
    expect(onLoaded).not.toHaveBeenCalled()
    resolve()
    await vi.waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1))
    expect(gate()).toBe(true)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not trigger onLoaded when the stats are still unloaded, and can retry', async () => {
    const load = vi.fn(async () => {})
    const onLoaded = vi.fn()
    const gate = createStatsGate({ isLoaded: () => false, load, onLoaded })
    gate()
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(onLoaded).not.toHaveBeenCalled()
    gate()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
