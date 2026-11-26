import { dirname, resolve } from 'node:path'
import nodeGypBuild from 'node-gyp-build'
import { FocusArbiter, releaseLayerKeyboards, type LayerTracker, type TrackerEvent } from 'electron-overlay-window'
import { WaylandHost, type ToplevelInfo } from 'electron-overlay-window/dist/wayland/host'
import { reportBreadcrumb } from '../../../common/diagnostics'
import { matchGameWindow, type GameWindowMatch } from '../../../common/game-window-identity'
import {
  clearLinuxGameDisplayMode,
  getLinuxGameDisplayModeStatus,
  reportLinuxGameDisplayMode,
} from '../game-display-mode'
import type { WindowGeometryInfo, WindowGeometryProvider } from './geometry-provider'
import { gameTitleIndex } from './title-index'
import { mapX11BoundsToLogical, type WindowBounds } from './window-geometry'

const EVENT = {
  ATTACH: 1,
  FOCUS: 2,
  BLUR: 3,
  DETACH: 4,
  FULLSCREEN: 5,
  MOVERESIZE: 6,
} as const

type NativeEvent = WindowBounds & {
  type: number
  titleIndex?: number
  isFullscreen?: boolean
  hasAccess?: boolean
}

interface NativeX11Hook {
  start(handle: undefined, titles: string[], handler: (event: NativeEvent) => void): void
  setTargetTitles(titles: string[]): void
  clearTarget(): void
  stopHook(): void
  /** Finds a window by exact title via a private X connection. Added by the
   *  vendored addon patch for compositors without `_NET_ACTIVE_WINDOW`. */
  findWindowBounds?(title: string): WindowBounds | null
}

/** The same native addon as the X11 path, in tracking-only mode. It supplies
 *  exact geometry for XWayland games; the compositor's foreign-toplevel manager
 *  supplies attach/focus, which X11 cannot see on compositors that do not
 *  maintain `_NET_ACTIVE_WINDOW`. */
function x11Hook(): NativeX11Hook {
  const root = resolve(dirname(require.resolve('electron-overlay-window')), '..')
  return nodeGypBuild(root) as NativeX11Hook
}

const format = (r: WindowBounds): string => `x=${r.x} y=${r.y} w=${r.width} h=${r.height}`
const gameLike = (info: Pick<ToplevelInfo, 'title' | 'appId'>): boolean =>
  /path of exile|\bpoe\b|exile/i.test(info.title ?? '') || /pathofexile|(?:^|[^a-z])poe/i.test(info.appId ?? '')

interface FoundGeometry {
  readonly info: WindowGeometryInfo
  readonly source: string
  /** From a compositor provider, which then owns geometry over X11 events. */
  readonly preferred: boolean
}

export interface WaylandWindowTrackerOptions {
  /** Ordered compositor-specific geometry sources, tried before X11. */
  readonly geometryProviders?: readonly WindowGeometryProvider[]
}

/**
 * Generic layer-shell tracker. Foreign toplevels are authoritative for which
 * target is attached and focused; the X11 hook is authoritative for its exact
 * geometry. Either source alone is incomplete on a tiling Wayland compositor:
 * foreign toplevels expose no size, and XWayland has no active-window property.
 */
export class WaylandWindowTracker implements LayerTracker {
  private readonly arbiter: FocusArbiter
  private readonly host: WaylandHost
  private readonly lib: NativeX11Hook
  private readonly emit: (event: TrackerEvent) => void
  private readonly geometryProviders: readonly WindowGeometryProvider[]
  private readonly fallbackGeometryProviders: readonly WindowGeometryProvider[]
  private readonly offHost: Array<() => void>
  private readonly geometryTimer: NodeJS.Timeout | null
  private geometryQuery: Promise<void> | null = null
  private geometryRequeried = false
  private warnedNoX11 = false
  private titles: string[]
  private attachedTid: number | null = null
  private rawBounds: WindowBounds | null = null
  private rawIsLogical = false
  private geometrySource = 'x11'
  private lastToplevelSummary = ''
  private lastIgnoredNative = ''
  /** While a compositor provider owns geometry, X11 focus/geometry events are
   *  stale guesses and must not override it. */
  private usingPreferredGeometry = false
  private bounds: WindowBounds | null = null
  private fullscreen = false
  private started = false
  private stopped = false

  constructor(
    host: WaylandHost,
    titles: string[],
    emit: (event: TrackerEvent) => void,
    options: WaylandWindowTrackerOptions = {},
  ) {
    this.host = host
    this.titles = titles
    this.emit = emit
    const providers = options.geometryProviders ?? []
    this.geometryProviders = providers.filter((provider) => provider.phase !== 'fallback')
    this.fallbackGeometryProviders = providers.filter((provider) => provider.phase === 'fallback')
    this.arbiter = new FocusArbiter(emit)
    this.lib = x11Hook()
    this.offHost = [
      host.onToplevel(() => this.updateFromToplevels()),
      host.onOutputs(() => {
        this.reproject()
        this.updateFromToplevels()
      }),
      host.onRestart(() => this.updateFromToplevels()),
    ]
    this.started = true
    this.lib.start(undefined, titles, (event) => this.onEvent(event))
    this.queryWindowGeometry()
    this.geometryTimer = setInterval(() => this.queryWindowGeometry(), 500)
    this.geometryTimer.unref?.()
    this.updateFromToplevels()
    reportBreadcrumb(`layer-shell tracker created titles=${JSON.stringify(titles)}`, 'debug')
  }

  get targetHasFocus(): boolean {
    return this.arbiter.isActive
  }

  setTitles(titles: string[]): void {
    if (this.bounds) this.detach()
    this.titles = titles
    if (this.started && !this.stopped) this.lib.setTargetTitles(titles)
    reportBreadcrumb(`layer-shell tracker titles set titles=${JSON.stringify(titles)}`, 'debug')
    if (!this.stopped) {
      this.queryWindowGeometry()
      this.updateFromToplevels()
    }
  }

  clear(): void {
    this.detach()
    if (this.started && !this.stopped) this.lib.clearTarget()
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    if (this.geometryTimer) clearInterval(this.geometryTimer)
    for (const off of this.offHost) off()
    this.arbiter.stop()
    if (this.started) this.lib.stopHook()
  }

  focusTarget(): void {
    releaseLayerKeyboards()
    if (this.attachedTid !== null && this.arbiter.isActive) {
      this.host.activateToplevel(this.attachedTid)
      return
    }
    if (!this.arbiter.isActive) return
    const toplevel = this.activeToplevel()
    if (toplevel) this.host.activateToplevel(toplevel.tid)
  }

  /** Starts a geometry poll unless one is in flight; a request made while one
   *  runs (new titles) starts another as soon as it settles. Providers call
   *  compositor CLIs, so the poll never blocks the main process. */
  private queryWindowGeometry(): void {
    if (this.stopped) return
    if (this.geometryQuery) {
      this.geometryRequeried = true
      return
    }
    const titles = this.titles
    this.geometryQuery = this.readGeometry(titles)
      .then((found) => {
        // Titles changed mid-poll: the answer is for the old target.
        if (!this.stopped && titles === this.titles) this.applyGeometry(found)
      })
      .catch((error: unknown) => reportBreadcrumb(`layer-shell tracker geometry failed error=${String(error)}`))
      .finally(() => {
        this.geometryQuery = null
        if (!this.geometryRequeried) return
        this.geometryRequeried = false
        this.queryWindowGeometry()
      })
  }

  /** Reads the sources that can supply exact window geometry. A compositor
   *  provider wins when configured: on Sway, X11 coordinates use a different
   *  origin and would place a fullscreen game at a bogus offset. Foreign
   *  toplevels still decide attach/focus; they never provide a size. */
  private async readGeometry(titles: readonly string[]): Promise<FoundGeometry | null> {
    const fromProvider = async (
      providers: readonly WindowGeometryProvider[],
      preferred: boolean,
    ): Promise<FoundGeometry | null> => {
      for (const provider of providers) {
        const info = await provider.read(titles)
        if (!info || info.bounds.width <= 0 || info.bounds.height <= 0) continue
        if (info.mode) reportLinuxGameDisplayMode(info.mode, provider.reportSource)
        return { info, source: provider.id, preferred }
      }
      return null
    }

    const preferred = await fromProvider(this.geometryProviders, true)
    if (preferred) return preferred

    if (!this.rawBounds && this.lib.findWindowBounds) {
      // X11 window bounds use a different origin (and can point at a launcher),
      // so they are only a bootstrap source before any exact geometry exists.
      // Once a projection is known, a momentary provider miss keeps the last
      // good bounds instead of jumping a fullscreen game to a bogus offset.
      for (const title of titles) {
        const bounds = this.lib.findWindowBounds(title)
        if (bounds && bounds.width > 0 && bounds.height > 0) {
          reportLinuxGameDisplayMode('x11', 'x11-geometry')
          return { info: { bounds, logical: false }, source: 'x11', preferred: false }
        }
      }
    }
    return fromProvider(this.fallbackGeometryProviders, false)
  }

  private applyGeometry(found: FoundGeometry | null): void {
    if (!found) {
      if (!this.warnedNoX11) {
        reportBreadcrumb(`layer-shell tracker geometry not found titles=${JSON.stringify(this.titles)}`, 'debug')
        this.warnedNoX11 = true
      }
      return
    }
    const { info, source, preferred } = found
    this.usingPreferredGeometry = preferred
    this.warnedNoX11 = false
    if (
      this.rawBounds &&
      this.rawIsLogical === info.logical &&
      JSON.stringify(info.bounds) === JSON.stringify(this.rawBounds)
    ) {
      return
    }
    this.rawBounds = info.bounds
    this.rawIsLogical = info.logical
    this.geometrySource = source
    reportBreadcrumb(
      `layer-shell tracker ${source} bounds preferred=${preferred} logical=${info.logical} raw=${format(info.bounds)} ` +
        `identity=${info.identity || '-'} outputs=${info.outputs?.join(',') || '-'}` +
        (info.detail ? ` detail=${info.detail}` : ''),
      'debug',
    )
    if (this.attachedTid !== null) this.reproject()
    else this.updateFromToplevels()
  }

  private gameMatch(info: Pick<ToplevelInfo, 'title' | 'appId'>): GameWindowMatch {
    return matchGameWindow({ title: info.title, appId: info.appId }, this.titles)
  }

  /** Native attach events carry a title index so the host can infer PoE1 vs
   *  PoE2. A foreign toplevel may have a launcher-decorated title, so map the
   *  verified variant back to the host's title slot instead of string equality. */
  private titleIndexFor(info: ToplevelInfo, match: GameWindowMatch): number {
    return gameTitleIndex(this.titles, info.title, match)
  }

  private activeToplevel(): ToplevelInfo | undefined {
    return [...this.host.toplevels.values()].find((info) => info.activated && this.gameMatch(info).accepted)
  }

  private attachedToplevel(): ToplevelInfo | undefined {
    return this.attachedTid === null ? undefined : this.host.toplevels.get(this.attachedTid)
  }

  /** Output that owns the attached toplevel, used to disambiguate equal-scale
   *  monitors and to size the surface when X11 geometry is unavailable. */
  private outputNames(toplevel?: ToplevelInfo): string[] {
    if (toplevel?.outputs.length) return toplevel.outputs
    if (toplevel) return []
    const active = this.activeToplevel()
    return active?.outputs ?? []
  }

  private outputBounds(toplevel?: ToplevelInfo): WindowBounds | null {
    const names = this.outputNames(toplevel)
    const output = this.host.outputs.find((o) => names.includes(o.name)) ?? this.host.outputs[0]
    return output ? { x: output.x, y: output.y, width: output.width, height: output.height } : null
  }

  private project(toplevel?: ToplevelInfo): WindowBounds | null {
    if (this.rawBounds) {
      return this.rawIsLogical
        ? this.rawBounds
        : mapX11BoundsToLogical(this.rawBounds, this.host.outputs, this.outputNames(toplevel))
    }
    return this.outputBounds(toplevel)
  }

  private attach(tid: number, titleIndex: number, fullscreen: boolean, bounds: WindowBounds, source: string): void {
    // Reattaching to another foreign toplevel is a target swap, not a loss of
    // compositor geometry. Preserve the source/guard or a stale X11 event can
    // remap the exact rect onto the wrong output immediately after attach.
    const previousTid = this.attachedTid
    this.detach(true)
    if (previousTid !== null && previousTid !== tid) {
      reportBreadcrumb(
        `layer-shell tracker target swap old=${previousTid} new=${tid} ` +
          `geometry=${this.geometrySource} preferred=${this.usingPreferredGeometry}`,
        'debug',
      )
    }
    this.attachedTid = tid
    this.bounds = bounds
    this.fullscreen = fullscreen
    this.arbiter.reset(true)
    const gameMode = getLinuxGameDisplayModeStatus()
    reportBreadcrumb(
      `layer-shell tracker attach via=${source} tid=${tid} geometry=${this.geometrySource} ` +
        `gameMode=${gameMode.mode ?? '-'} modeSource=${gameMode.source ?? '-'} ` +
        `preferred=${this.usingPreferredGeometry} raw=${this.rawBounds ? format(this.rawBounds) : '-'} ` +
        `logical=${format(bounds)} outputs=${this.outputNames(this.attachedToplevel()).join(',') || 'auto'} ` +
        `fullscreen=${fullscreen}`,
    )
    this.emit({
      type: 'attach',
      hasAccess: undefined,
      isFullscreen: fullscreen,
      titleIndex,
      ...bounds,
    })
    this.emit({ type: 'focus' })
  }

  private detach(preserveGeometry = false): void {
    const wasAttached = this.attachedTid !== null
    this.attachedTid = null
    if (!preserveGeometry) {
      this.rawBounds = null
      this.rawIsLogical = false
      this.geometrySource = 'x11'
      this.usingPreferredGeometry = false
      this.lastIgnoredNative = ''
    }
    this.bounds = null
    if (!wasAttached) {
      this.arbiter.reset(false)
      return
    }
    if (!preserveGeometry) clearLinuxGameDisplayMode()
    if (this.arbiter.isActive) this.emit({ type: 'blur' })
    this.arbiter.reset(false)
    this.emit({ type: 'detach' })
  }

  private reproject(): void {
    if (!this.bounds) return
    const next = this.project(this.attachedToplevel())
    if (!next || JSON.stringify(next) === JSON.stringify(this.bounds)) return
    this.bounds = next
    reportBreadcrumb(
      `layer-shell tracker reproject geometry=${this.geometrySource} preferred=${this.usingPreferredGeometry} ` +
        `raw=${this.rawBounds ? format(this.rawBounds) : '-'} logical=${format(next)}`,
      'debug',
    )
    this.emit({ type: 'moveresize', ...next })
  }

  /** Foreign toplevels decide attach/detach/focus. Exact geometry is layered on
   *  top whenever the X11 hook has supplied it. */
  private updateFromToplevels(): void {
    if (this.stopped) return
    const active = this.activeToplevel()
    const candidates = [...this.host.toplevels.values()].map((info) => ({ info, match: this.gameMatch(info) }))
    const matches = candidates.filter((entry) => entry.match.accepted)
    const rejected = candidates.filter((entry) => !entry.match.accepted && gameLike(entry.info))
    const summary =
      `active=${active?.tid ?? '-'} attached=${this.attachedTid ?? '-'} ` +
      matches
        .map(
          ({ info, match }) =>
            `tid=${info.tid} app=${info.appId || '-'} variant=${match.variant ?? '-'} ` +
            `outputs=${info.outputs.join(',') || '-'} activated=${info.activated} fullscreen=${info.fullscreen}`,
        )
        .join(' | ') +
      (rejected.length
        ? ` rejected=${rejected
            .map(({ info, match }) => `tid=${info.tid} app=${info.appId || '-'} reason=${match.reason}`)
            .join(' | ')}`
        : '')
    if (summary !== this.lastToplevelSummary) {
      this.lastToplevelSummary = summary
      reportBreadcrumb(`layer-shell tracker toplevels count=${matches.length} ${summary}`, 'debug')
    }
    if (active && active.tid !== this.attachedTid) {
      const bounds = this.project(active)
      if (!bounds) return
      const match = this.gameMatch(active)
      this.attach(active.tid, this.titleIndexFor(active, match), active.fullscreen, bounds, 'toplevel')
      return
    }
    const target = this.attachedToplevel()
    if (!target || !this.gameMatch(target).accepted) {
      if (this.attachedTid !== null) this.detach()
      return
    }
    this.reproject()
    if (target.fullscreen !== this.fullscreen) {
      this.fullscreen = target.fullscreen
      this.emit({ type: 'fullscreen', isFullscreen: this.fullscreen })
    }
    this.arbiter.setGameFocused(target.activated)
  }

  private onEvent(event: NativeEvent): void {
    if (this.stopped) return
    const { type, ...rest } = event
    const raw: WindowBounds = { x: rest.x, y: rest.y, width: rest.width, height: rest.height }
    if (this.usingPreferredGeometry) {
      const trace = `type=${type} raw=${format(raw)}`
      if (trace !== this.lastIgnoredNative) {
        this.lastIgnoredNative = trace
        reportBreadcrumb(`layer-shell tracker ignored native event ${trace} geometry=${this.geometrySource}`, 'debug')
      }
      return
    }
    switch (type) {
      case EVENT.ATTACH: {
        this.rawBounds = raw
        this.rawIsLogical = false
        this.geometrySource = 'x11'
        const toplevel = this.activeToplevel() ?? this.attachedToplevel()
        const bounds = this.project(toplevel) ?? raw
        if (this.attachedTid === null) {
          this.attach(
            toplevel?.tid ?? -1,
            event.titleIndex ?? rest.titleIndex ?? 0,
            event.isFullscreen === true || (toplevel?.fullscreen ?? false),
            bounds,
            'x11',
          )
        } else {
          this.bounds = bounds
          this.reproject()
        }
        return
      }
      case EVENT.MOVERESIZE: {
        if (this.rawBounds && JSON.stringify(raw) === JSON.stringify(this.rawBounds)) return
        this.rawBounds = raw
        this.rawIsLogical = false
        this.geometrySource = 'x11'
        this.reproject()
        return
      }
      case EVENT.FULLSCREEN: {
        this.fullscreen = event.isFullscreen === true
        this.emit({ type: 'fullscreen', isFullscreen: this.fullscreen })
        return
      }
      case EVENT.FOCUS:
        this.arbiter.setGameFocused(true)
        return
      case EVENT.BLUR:
        this.arbiter.setGameFocused(false)
        return
      case EVENT.DETACH:
        // A foreign toplevel can stay active when focus moves into a layer
        // surface; only tear down when the compositor agrees the game is gone.
        this.rawBounds = null
        this.rawIsLogical = false
        this.geometrySource = 'x11'
        if (!this.activeToplevel()) this.detach()
        else this.reproject()
        return
    }
  }
}
