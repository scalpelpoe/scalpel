// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { acquireStream, releaseStream, revalidateStream, _resetStreamForTests } from './stream'

function fakeStream(): MediaStream {
  const track = { stop: vi.fn() }
  return { getTracks: () => [track] } as unknown as MediaStream
}

function installApi(getSource = vi.fn().mockResolvedValue({ sourceId: 'window:1', gameSize: { w: 1920, h: 1080 } })) {
  const onSourceInvalidated = vi.fn().mockReturnValue(() => {})
  const onSourceMaybeStale = vi.fn().mockReturnValue(() => {})
  // @ts-expect-error test shim
  window.api = { screen: { getGameWindowSource: getSource, onSourceInvalidated, onSourceMaybeStale } }
  return { getSource, onSourceInvalidated, onSourceMaybeStale }
}

afterEach(() => {
  _resetStreamForTests()
  vi.restoreAllMocks()
})

describe('live-mirror stream singleton', () => {
  it('opens one stream for N consumers and notifies each', async () => {
    installApi()
    const s = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValue(s)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const a = vi.fn()
    const b = vi.fn()
    await acquireStream(a)
    await acquireStream(b)

    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(a).toHaveBeenCalledWith(s)
    expect(b).toHaveBeenCalledWith(s)
  })

  it('stops all tracks when the last consumer releases', async () => {
    installApi()
    const s = fakeStream()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(s) } })

    const a = vi.fn()
    const b = vi.fn()
    await acquireStream(a)
    await acquireStream(b)
    releaseStream(a)
    expect(s.getTracks()[0].stop).not.toHaveBeenCalled()
    releaseStream(b)
    expect(s.getTracks()[0].stop).toHaveBeenCalledTimes(1)
  })

  it('notifies consumers with null when the source cannot be resolved', async () => {
    installApi(vi.fn().mockResolvedValue(null))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn() } })
    const a = vi.fn()
    await acquireStream(a)
    expect(a).toHaveBeenCalledWith(null)
  })

  it('does not deliver or leak a stream when the only listener releases during open', async () => {
    installApi()
    const s = fakeStream()
    let resolveGum!: (v: MediaStream) => void
    const getUserMedia = vi.fn().mockReturnValue(
      new Promise<MediaStream>((res) => {
        resolveGum = res
      }),
    )
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const a = vi.fn()
    const p = acquireStream(a)
    releaseStream(a)
    resolveGum(s)
    await p
    expect(a).not.toHaveBeenCalledWith(s)
    expect(s.getTracks()[0].stop).toHaveBeenCalled()
  })

  it('unsubscribes from source-invalidated when the last consumer releases', async () => {
    const unsub = vi.fn()
    const onSourceInvalidated = vi.fn().mockReturnValue(unsub)
    // @ts-expect-error test shim
    window.api = {
      screen: {
        getGameWindowSource: vi.fn().mockResolvedValue({ sourceId: 'window:1', gameSize: { w: 1, h: 1 } }),
        onSourceInvalidated,
        onSourceMaybeStale: vi.fn().mockReturnValue(() => {}),
      },
    }
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) } })
    const a = vi.fn()
    await acquireStream(a)
    releaseStream(a)
    expect(unsub).toHaveBeenCalledTimes(1)
  })
})

describe('revalidateStream', () => {
  it('reopens when the freshly resolved id differs from the one the stream was opened with', async () => {
    const getSource = vi
      .fn()
      .mockResolvedValueOnce({ sourceId: 'window:1', gameSize: { w: 1920, h: 1080 } })
      .mockResolvedValueOnce({ sourceId: 'window:2', gameSize: { w: 1920, h: 1080 } })
    installApi(getSource)
    const s1 = fakeStream()
    const s2 = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValueOnce(s1).mockResolvedValueOnce(s2)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const a = vi.fn()
    await acquireStream(a)
    expect(a).toHaveBeenLastCalledWith(s1)

    await revalidateStream()

    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(a).toHaveBeenLastCalledWith(s2)
  })

  it('is a no-op when the resolved id is unchanged', async () => {
    installApi()
    const s = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValue(s)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const a = vi.fn()
    await acquireStream(a)
    await revalidateStream()

    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })

  it('recovers a null stream once the source becomes resolvable', async () => {
    const getSource = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ sourceId: 'window:1', gameSize: { w: 1920, h: 1080 } })
    installApi(getSource)
    const s = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValue(s)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const a = vi.fn()
    await acquireStream(a)
    expect(a).toHaveBeenLastCalledWith(null)

    await revalidateStream()

    expect(a).toHaveBeenLastCalledWith(s)
  })

  it('does not call getSource again when there are no listeners', async () => {
    const { getSource } = installApi()
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream())
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const a = vi.fn()
    await acquireStream(a)
    releaseStream(a)
    getSource.mockClear()

    await revalidateStream()

    expect(getSource).not.toHaveBeenCalled()
  })

  it('keeps a healthy stream on a transient resolve miss', async () => {
    const getSource = vi
      .fn()
      .mockResolvedValueOnce({ sourceId: 'window:1', gameSize: { w: 1920, h: 1080 } })
      .mockResolvedValueOnce(null)
    installApi(getSource)
    const s = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValue(s)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    const a = vi.fn()
    await acquireStream(a)
    a.mockClear()

    await revalidateStream()

    expect(s.getTracks()[0].stop).not.toHaveBeenCalled()
    expect(a).not.toHaveBeenCalledWith(null)
  })

  it('defers to a reopen that started while revalidate was resolving', async () => {
    const s1 = fakeStream()
    const s2 = fakeStream()
    const getUserMedia = vi.fn().mockResolvedValueOnce(s1).mockResolvedValueOnce(s2)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

    // Call 1: initial acquireStream's own resolve.
    // Call 2: revalidate's fetch - held pending until we explicitly resolve it.
    // Call 3: the source-invalidated reopen's own resolve - resolves immediately.
    let resolveRevalidateFetch!: (v: { sourceId: string; gameSize: { w: number; h: number } }) => void
    const getSource = vi
      .fn()
      .mockResolvedValueOnce({ sourceId: 'window:1', gameSize: { w: 1920, h: 1080 } })
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveRevalidateFetch = res
        }),
      )
      .mockResolvedValueOnce({ sourceId: 'window:2', gameSize: { w: 1920, h: 1080 } })
    const { onSourceInvalidated } = installApi(getSource)

    const a = vi.fn()
    await acquireStream(a)
    expect(a).toHaveBeenLastCalledWith(s1)

    const invalidatedHandler = onSourceInvalidated.mock.calls[0][0] as () => void

    const revalidatePromise = revalidateStream()
    // Fires while revalidate's fetch is still pending; its own getSource call
    // and getUserMedia resolve immediately, landing before revalidate resumes.
    invalidatedHandler()
    await Promise.resolve()
    await Promise.resolve()

    // Now let revalidate's stale fetch resolve.
    resolveRevalidateFetch({ sourceId: 'window:1', gameSize: { w: 1920, h: 1080 } })
    await revalidatePromise

    expect(a).toHaveBeenLastCalledWith(s2)
    expect(getUserMedia).toHaveBeenCalledTimes(2)
  })
})
