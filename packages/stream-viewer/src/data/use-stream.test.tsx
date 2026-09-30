// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeTwitch, jsonResponse, sampleHead, sampleSnapshot } from '../test-helpers'
import { twitchVersionSubscriber, useStream } from './use-stream'

const flush = () => act(() => vi.advanceTimersByTimeAsync(0))

function api(overrides: { head?: () => Response; snapshot?: (url: string) => Response } = {}) {
  return vi.fn(async (url: string) => {
    if (url.includes('/heads/')) return overrides.head?.() ?? jsonResponse(sampleHead())
    return overrides.snapshot?.(url) ?? jsonResponse(sampleSnapshot())
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useStream', () => {
  it('loads the head, then its snapshot', async () => {
    const fetcher = api()
    const { result } = renderHook(() => useStream({ kind: 'slug', slug: 'aer0__' }, { fetcher, pollMs: 60_000 }))
    expect(result.current.status).toBe('loading')
    await flush()
    expect(result.current).toMatchObject({ status: 'ready', head: { version: 1 } })
    expect(fetcher.mock.calls.map(([u]) => u).at(-1)).toContain('/v1/snapshots/p1/1')
  })

  it('reports a streamer without a profile', async () => {
    const fetcher = api({ head: () => jsonResponse({}, 404) })
    const { result } = renderHook(() => useStream({ kind: 'slug', slug: 'nobody' }, { fetcher, pollMs: 60_000 }))
    await flush()
    expect(result.current.status).toBe('not-set-up')
  })

  it('refetches announced versions after a jittered delay', async () => {
    const twitch = fakeTwitch()
    const fetcher = api()
    const { result } = renderHook(() =>
      useStream(
        { kind: 'twitch', channelId: '123' },
        { fetcher, pollMs: 300_000, subscribe: twitchVersionSubscriber(twitch.ext), random: () => 0.5 },
      ),
    )
    await flush()
    const calls = fetcher.mock.calls.length
    twitch.broadcast('{"t":"s","v":2}')
    twitch.broadcast('not json')
    await act(() => vi.advanceTimersByTimeAsync(1499))
    expect(fetcher.mock.calls.length).toBe(calls)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain('/v1/snapshots/p1/2')
    expect(result.current).toMatchObject({ status: 'ready', head: { version: 2 } })
  })

  it('ignores versions it already has', async () => {
    const twitch = fakeTwitch()
    const fetcher = api()
    renderHook(() =>
      useStream(
        { kind: 'twitch', channelId: '123' },
        { fetcher, pollMs: 300_000, subscribe: twitchVersionSubscriber(twitch.ext), random: () => 0 },
      ),
    )
    await flush()
    const calls = fetcher.mock.calls.length
    twitch.broadcast('{"t":"s","v":1}')
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(fetcher.mock.calls.length).toBe(calls)
  })

  it('picks up state changes and new versions on the poll', async () => {
    let head = sampleHead()
    const fetcher = api({ head: () => jsonResponse(head) })
    const { result } = renderHook(() => useStream({ kind: 'slug', slug: 'aer0__' }, { fetcher, pollMs: 60_000 }))
    await flush()
    head = sampleHead({ state: 'paused' })
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(result.current).toMatchObject({ status: 'ready', head: { state: 'paused', version: 1 } })
    head = sampleHead({ version: 3 })
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(result.current).toMatchObject({ head: { version: 3 } })
  })

  it('keeps the last gear through a failed poll', async () => {
    let fail = false
    const fetcher = api({ head: () => (fail ? jsonResponse({}, 502) : jsonResponse(sampleHead())) })
    const { result } = renderHook(() => useStream({ kind: 'slug', slug: 'aer0__' }, { fetcher, pollMs: 60_000 }))
    await flush()
    fail = true
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(result.current.status).toBe('ready')
  })

  it('unsubscribes and stops polling on unmount', async () => {
    const twitch = fakeTwitch()
    const fetcher = api()
    const { unmount } = renderHook(() =>
      useStream(
        { kind: 'twitch', channelId: '123' },
        { fetcher, pollMs: 1000, subscribe: twitchVersionSubscriber(twitch.ext) },
      ),
    )
    await flush()
    expect(twitch.listenerCount()).toBe(1)
    unmount()
    expect(twitch.listenerCount()).toBe(0)
    const calls = fetcher.mock.calls.length
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(fetcher.mock.calls.length).toBe(calls)
  })
})
