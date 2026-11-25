import { getAllGameTitles, matchGameWindow, type PlatformGameVariant } from '../../../common/game-window-identity'

/**
 * Shared cache of "which compositor window is focused".
 *
 * Two readers can feed it: the generic zwlr foreign-toplevel protocol and the
 * KWin scripting bridge. Feature code (`readWaylandGameFocus`,
 * `isWaylandGameFocused`, `onWaylandGameFocusChange`, recent-window hints)
 * only ever reads this cache, so a compositor adapter never leaks into the
 * host app.
 */

export type WaylandFocusSource = 'zwlr-foreign-toplevel-manager-v1' | 'kde-kwin-script'

export interface WaylandGameFocus {
  title: string | null
  appId: string | null
  game: boolean
  variant?: PlatformGameVariant | null
  /** Match result for debug breadcrumbs: `game` or a rejection reason. */
  reason?: string
  source: WaylandFocusSource
}

export interface RecentWindow {
  readonly title: string
  readonly appId: string | null
}

export interface CompositorFocusInput {
  readonly title: string | null
  readonly appId: string | null
  /** KWin and similar adapters can expose the full X11/Wayland identity. */
  readonly className?: string | null
  readonly instance?: string | null
  readonly source: WaylandFocusSource
}

let published: WaylandGameFocus | null = null
let recentWindows: readonly RecentWindow[] = []
let publishedHints: readonly string[] = []
let compositorOwned = false
const listeners = new Set<(focus: WaylandGameFocus | null) => void>()
const titleListeners = new Set<(hints: readonly string[]) => void>()

function sameFocus(a: WaylandGameFocus | null, b: WaylandGameFocus | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.title === b.title &&
    a.appId === b.appId &&
    a.game === b.game &&
    a.variant === b.variant &&
    a.reason === b.reason &&
    a.source === b.source
  )
}

const recentKey = (window: RecentWindow): string => `${window.title}|${window.appId ?? ''}`

/** Exactly the compact string a user can paste into the game-title field. */
const formatRecentWindow = (window: RecentWindow): string =>
  window.appId ? `${window.title}|${window.appId}` : window.title

function notifyFocus(): void {
  for (const listener of listeners) {
    try {
      listener(published)
    } catch {
      // Listener errors must not break focus tracking.
    }
  }
}

function publishRecentWindows(next: readonly RecentWindow[]): void {
  const hints = next.map(formatRecentWindow)
  if (hints.length === publishedHints.length && hints.every((hint, index) => hint === publishedHints[index])) return
  recentWindows = next
  publishedHints = hints
  for (const listener of titleListeners) {
    try {
      listener(publishedHints)
    } catch {
      // Listener errors must not break focus tracking.
    }
  }
}

/** Publish the compositor's activated window. Passing null means no window is
 *  active (or the source disconnected), which must clear focus so hotkeys
 *  suspend instead of firing into an unknown target. */
export function publishCompositorFocus(input: CompositorFocusInput | null): void {
  const match = input
    ? matchGameWindow(
        {
          title: input.title,
          appId: input.appId,
          className: input.className ?? null,
          instance: input.instance ?? null,
        },
        getAllGameTitles(),
      )
    : null
  const next: WaylandGameFocus | null = input
    ? {
        title: input.title,
        appId: input.appId,
        game: match?.accepted ?? false,
        variant: match?.variant ?? null,
        reason: match?.reason ?? 'no-match',
        source: input.source,
      }
    : null
  if (sameFocus(published, next)) return
  published = next
  notifyFocus()
}

/** Keep the activated window and the one before it so the settings UI can show
 *  the exact `title|appId` value to paste into the title field. */
export function publishRecentWindow(window: RecentWindow): void {
  const title = window.title.trim()
  if (!title) return
  const next: RecentWindow = { title, appId: window.appId?.trim() || null }
  if (recentWindows[0] && recentKey(recentWindows[0]) === recentKey(next)) return
  publishRecentWindows([next, ...recentWindows.filter((entry) => recentKey(entry) !== recentKey(next))].slice(0, 2))
}

/** Cached activated window, or null when compositor focus is unknown. */
export function currentWaylandGameFocus(): WaylandGameFocus | null {
  return published
}

/** Most recent activated windows as paste-ready `title|appId` strings: current
 *  first, previous second. Empty when no compositor window was observed. */
export function currentRecentWindowHints(): readonly string[] {
  return publishedHints
}

/** Subscribe to compositor focus changes. Fires only when the published
 *  snapshot actually changes. Returns an unsubscribe function. */
export function subscribeWaylandFocus(listener: (focus: WaylandGameFocus | null) => void): () => void {
  listeners.add(listener)
  if (published) listener(published)
  return () => {
    listeners.delete(listener)
  }
}

/** Subscribe to paste-ready window-hint changes. Returns an unsubscribe function. */
export function subscribeRecentWindowHints(listener: (hints: readonly string[]) => void): () => void {
  titleListeners.add(listener)
  if (publishedHints.length) listener(publishedHints)
  return () => {
    titleListeners.delete(listener)
  }
}

/** A compositor adapter owns focus now; the generic zwlr reader must not start
 *  and fight it for the cache. */
export function setCompositorFocusSource(owned: boolean): void {
  compositorOwned = owned
}

export function compositorFocusSourceOwned(): boolean {
  return compositorOwned
}

/** Drop everything and notify listeners. Used when a focus source disconnects. */
export function clearCompositorFocus(): void {
  publishCompositorFocus(null)
  if (recentWindows.length) publishRecentWindows([])
}

/** @internal Test-only reset. */
export function __resetWaylandFocusCacheForTests(): void {
  published = null
  recentWindows = []
  publishedHints = []
  compositorOwned = false
  listeners.clear()
  titleListeners.clear()
}
