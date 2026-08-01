/** Ref-counted holder for the single PoE-window capture stream shared by every
 *  live-mirror element. The first consumer opens it; the last consumer stops
 *  it. A `source-invalidated` event (new/closed game window) reopens it for the
 *  current consumers. Focus/shown moments also trigger `revalidateStream`,
 *  which only reopens when a fresh resolve disagrees with the bound source id -
 *  a one-shot invalidation can bind wrong against a lingering dead window.
 *  Consumers are notified with the stream, or null when the source can't be
 *  resolved (game detached / capture denied). */
export type StreamListener = (stream: MediaStream | null) => void

const listeners = new Set<StreamListener>()
let stream: MediaStream | null = null
let opening: Promise<void> | null = null
let unsubInvalidated: (() => void) | null = null
let unsubMaybeStale: (() => void) | null = null
// The source id the current `stream` was opened against, so revalidateStream
// can tell a fresh resolve apart from the one already bound.
let openedSourceId: string | null = null
let lastRevalidateAt = 0

async function openStream(
  prefetchedInfo?: { sourceId: string; gameSize: { w: number; h: number } } | null,
): Promise<void> {
  const info = prefetchedInfo !== undefined ? prefetchedInfo : await window.api.screen.getGameWindowSource()
  if (!info) {
    stream = null
    openedSourceId = null
    notify()
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      // Legacy desktop-capture constraints. If the de-risk probe in Task 1
      // required getDisplayMedia instead, swap this block for that path.
      video: {
        // Native resolution (no maxHeight cap): the live-mirror crop compares
        // the captured frame size to the client size to correct for window
        // chrome, so the frame must stay 1:1 with the window. One shared stream
        // feeds every mirror, so full-res is a single decode.
        mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: info.sourceId },
      },
    } as MediaStreamConstraints)
    openedSourceId = info.sourceId
  } catch (err) {
    if (import.meta.env.DEV) console.error('[live-mirror] getUserMedia failed', err)
    stream = null
    openedSourceId = null
  }
  // Everyone released while we were opening - don't leak the stream.
  if (stream !== null && listeners.size === 0) {
    stopStream()
    return
  }
  notify()
}

function notify(): void {
  for (const l of listeners) l(stream)
}

function stopStream(): void {
  if (stream) for (const t of stream.getTracks()) t.stop()
  stream = null
  openedSourceId = null
}

async function reopen(prefetchedInfo?: { sourceId: string; gameSize: { w: number; h: number } } | null): Promise<void> {
  // Drain any in-flight open first so we don't tear down a stream that hasn't
  // been assigned yet, and so the restart begins from a clean state.
  if (opening) await opening
  stopStream()
  opening = openStream(prefetchedInfo)
  await opening
}

export async function acquireStream(listener: StreamListener): Promise<void> {
  listeners.add(listener)
  if (!unsubInvalidated) {
    unsubInvalidated = window.api.screen.onSourceInvalidated(() => {
      if (listeners.size > 0) void reopen()
    })
  }
  if (!unsubMaybeStale) {
    unsubMaybeStale = window.api.screen.onSourceMaybeStale(() => {
      void revalidateStream()
    })
  }
  if (stream) {
    listener(stream)
    return
  }
  if (!opening) opening = openStream()
  await opening
  if (listeners.has(listener)) listener(stream)
}

export function releaseStream(listener: StreamListener): void {
  listeners.delete(listener)
  if (listeners.size === 0) {
    stopStream()
    opening = null
    unsubInvalidated?.()
    unsubInvalidated = null
    unsubMaybeStale?.()
    unsubMaybeStale = null
  }
}

/** Re-check that the open stream still corresponds to the source id a fresh
 *  resolve returns. The invalidated event fires once per attach and can bind
 *  wrong (a just-closed game window lingers in getSources under its title
 *  with a frozen but still-'live' track, and a restarting game can resolve
 *  null) - so focus/shown moments call this to converge. No-op when nothing
 *  is listening, when no source is resolvable (do not tear down a possibly
 *  working stream on a transient miss), or when the resolved id matches the
 *  one the stream was opened with. */
export async function revalidateStream(): Promise<void> {
  if (listeners.size === 0) return
  if (Date.now() - lastRevalidateAt < 1000) return
  lastRevalidateAt = Date.now()
  if (opening) await opening
  const openingBefore = opening
  const info = await window.api.screen.getGameWindowSource()
  // A reopen (source-invalidated) started while we were resolving: its fetch
  // is fresher than ours, so defer to it instead of clobbering its stream
  // with a prefetched id that may point at the window it just moved off.
  if (opening !== openingBefore) return
  if (!info) return
  if (stream !== null && info.sourceId === openedSourceId) return
  await reopen(info)
}

/** Test-only: clear module singleton state between cases. */
export function _resetStreamForTests(): void {
  listeners.clear()
  stream = null
  opening = null
  unsubInvalidated = null
  unsubMaybeStale = null
  openedSourceId = null
  lastRevalidateAt = 0
}
