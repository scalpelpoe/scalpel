import { FocusArbiter, releaseLayerKeyboards, type LayerTracker, type TrackerEvent } from 'electron-overlay-window'
import { reportBreadcrumb } from '@platform/common/diagnostics'
import { matchGameWindow, getGameIdentityHints, type GameWindowMatch } from '@platform/common/game-window-identity'
import { gameTitleIndex } from '@platform/linux/common/wayland/title-index'
import { setCompositorFocusSource } from '@platform/linux/common/wayland/focus-cache'
import { publishKWinFocus } from './focus'
import { KWinSession, type KWinPointer, type KWinSnapshot, type KWinWindow } from './session'

export interface KWinTrackerOptions {
  /** Injected by tests so no DBus connection is opened. */
  readonly session?: KWinSession
}

/**
 * Layer-shell tracker for KWin.
 *
 * KWin's scripting bridge is authoritative for attach, focus and exact
 * `clientGeometry`; there is no X11 geometry fallback and no foreign-toplevel
 * protocol involved. The tracker also feeds the shared Wayland focus cache.
 */
export class KWinTracker implements LayerTracker {
  private readonly arbiter: FocusArbiter
  private readonly session: KWinSession
  private titles: string[]
  private latest: KWinSnapshot | null = null
  private attached: KWinWindow | null = null
  private stopped = false

  constructor(
    titles: string[],
    private readonly emit: (event: TrackerEvent) => void,
    options: KWinTrackerOptions = {},
  ) {
    this.titles = titles
    this.arbiter = new FocusArbiter(emit)
    setCompositorFocusSource(true)
    this.session =
      options.session ??
      new KWinSession({
        onSnapshot: (snapshot) => this.handleSnapshot(snapshot),
        onPointer: (pointer) => this.handlePointer(pointer),
      })
    if (!options.session) this.session.start()
    reportBreadcrumb(
      `kwin tracker configured titles=${JSON.stringify(titles)} hints=${JSON.stringify(getGameIdentityHints())}`,
      'debug',
    )
  }

  get targetHasFocus(): boolean {
    return this.arbiter.isActive
  }

  setTitles(titles: string[]): void {
    this.detach()
    this.titles = titles
    this.update()
    reportBreadcrumb(`kwin tracker titles set titles=${JSON.stringify(titles)}`, 'debug')
  }

  clear(): void {
    this.setTitles([])
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.session.stop()
    this.arbiter.stop()
    this.detach()
    setCompositorFocusSource(false)
  }

  focusTarget(): void {
    // The overlay host releases its layer keyboard before this callback. KWin
    // then restores the previous toplevel without taking focus from other apps.
    releaseLayerKeyboards()
  }

  /** True while the attached game window, not an overlay, owns keyboard focus. */
  gameHasKeyboardFocus(): boolean {
    return this.attached !== null && this.latest?.active === this.attached.id
  }

  /** Pointer position while the game is focused; null otherwise. */
  pointer(): { x: number; y: number } | null {
    return this.gameHasKeyboardFocus() ? (this.latest?.pointer ?? null) : null
  }

  private match(window: KWinWindow): GameWindowMatch {
    return matchGameWindow(
      {
        title: window.caption,
        appId: window.desktopFileName || null,
        className: window.resourceClass || null,
        instance: window.resourceName || null,
      },
      this.titles,
    )
  }

  private lastActiveLog: string | null = null

  private logActive(active: KWinWindow | null): void {
    const key = active
      ? `${active.id}|${active.caption}|${active.desktopFileName}|${active.resourceClass}|${active.resourceName}`
      : 'none'
    if (key === this.lastActiveLog) return
    this.lastActiveLog = key
    reportBreadcrumb(
      active
        ? `kwin active id=${active.id} title=${JSON.stringify(active.caption)} ` +
            `desktop=${JSON.stringify(active.desktopFileName)} class=${JSON.stringify(active.resourceClass)} ` +
            `instance=${JSON.stringify(active.resourceName)}`
        : 'kwin active none',
      'debug',
    )
  }

  /** Apply one scripting snapshot. Also the seam used by unit tests. */
  handleSnapshot(snapshot: KWinSnapshot | null): void {
    if (this.stopped) return
    publishKWinFocus(snapshot)
    if (!snapshot) {
      this.latest = null
      this.detach()
      return
    }
    this.latest = snapshot
    this.update()
  }

  /** Pointer-only updates avoid restreaming the window list on every move. */
  handlePointer(pointer: KWinPointer): void {
    if (this.stopped || !this.latest) return
    this.latest = { ...this.latest, pointer }
  }

  private update(): void {
    const snapshot = this.latest
    if (!snapshot) return
    const active = snapshot.active ? (snapshot.windows.find((window) => window.id === snapshot.active) ?? null) : null
    this.logActive(active)
    const match = active ? this.match(active) : null

    if (active && match?.accepted && active.id !== this.attached?.id) {
      this.detach()
      this.attached = active
      this.arbiter.reset(true)
      reportBreadcrumb(
        `kwin tracker attach id=${active.id} bounds=${active.x},${active.y} ${active.width}x${active.height} ` +
          `identity=${active.desktopFileName || active.resourceClass || '-'} variant=${match.variant ?? '-'} ` +
          `fullscreen=${active.fullscreen}`,
      )
      this.emit({
        type: 'attach',
        x: active.x,
        y: active.y,
        width: active.width,
        height: active.height,
        titleIndex: gameTitleIndex(this.titles, active.caption, match),
        isFullscreen: active.fullscreen,
        hasAccess: undefined,
      })
      this.emit({ type: 'focus' })
      return
    }

    const current = this.attached
    const target = current ? (snapshot.windows.find((window) => window.id === current.id) ?? null) : null
    if (!current || !target || !this.match(target).accepted) {
      this.detach()
      return
    }
    this.attached = target
    if (
      target.x !== current.x ||
      target.y !== current.y ||
      target.width !== current.width ||
      target.height !== current.height
    ) {
      this.emit({ type: 'moveresize', x: target.x, y: target.y, width: target.width, height: target.height })
    }
    if (target.fullscreen !== current.fullscreen) {
      this.emit({ type: 'fullscreen', isFullscreen: target.fullscreen })
    }
    this.arbiter.setGameFocused(snapshot.active === target.id)
  }

  private detach(): void {
    if (!this.attached) return
    if (this.arbiter.isActive) this.emit({ type: 'blur' })
    this.arbiter.reset(false)
    this.attached = null
    this.emit({ type: 'detach' })
  }
}
