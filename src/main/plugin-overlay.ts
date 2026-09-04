import type { OverlayAnchor } from '@shared/types'
import { forwardLogLinesTo, onZoneChanged, sendCurrentZoneTo } from './client-log'
import { registerSecondaryOverlay, type OverlaySpec, type SecondaryOverlay } from './windowing'
import { flushEdges } from './windowing/snap-mounts'

export interface PluginOverlayOptions {
  title: string
  defaultSize?: { width: number; height: number }
  defaultPosition?: { fracX: number; fracY: number }
  /** Additional drag-snap homes besides defaultPosition, sized like it from
   *  defaultSize. Nearest to the drag wins. Lets a widget offer more than one
   *  mount (e.g. flush right by default, flush left as an alternative). */
  snapPositions?: { fracX: number; fracY: number }[]
  /** The user-moved geometry for this plugin, read lazily so a move made after
   *  registration is picked up on the next show. Undefined = never moved. */
  storedAnchor?: () => OverlayAnchor | undefined
  /** Fired when the user drags or resizes the window. Persist here. */
  onAnchorChanged?: (anchor: OverlayAnchor) => void
}

// One secondary-overlay handle per plugin id. Registered lazily the first time
// the plugin calls registerOverlay (via IPC). Survives for the process
// lifetime unless the owning plugin is uninstalled.
const overlays = new Map<string, SecondaryOverlay>()
const logForwardDisposers = new Map<string, () => void>()
let zoneFanoutWired = false

/** Clamp a plugin-supplied fraction into 0..max, falling back when it is absent
 *  or not a finite number. Plugin code is third-party, so the value is never
 *  trusted straight through to window bounds. max is 1 minus the window's own
 *  frac size (not 1), so a declared origin can never place the window partly
 *  off the game window's right/bottom edge - this anchor also doubles as the
 *  drag-snap home target, and nothing downstream re-clamps it against game or
 *  screen bounds, so an off-window default would be unrecoverable via snap. */
function clampFrac(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(0, value))
}

/** Default anchor sized from defaultSize (falling back to 380x520 CSS px
 *  against a nominal 1920x1080 game) and positioned from defaultPosition,
 *  centered when the plugin declares none. The secondary-overlay system
 *  re-derives real bounds from PoE at show time; these fractions only set the
 *  initial placement + snap-home target. defaultSize is plugin-supplied and
 *  floored at 1 CSS px per side for the same reason clampFrac exists below:
 *  the value is never trusted straight through to window bounds, and a zero
 *  or negative width/height would otherwise flow through to setBounds. */
function anchorFor(opts: PluginOverlayOptions, pos: { fracX?: number; fracY?: number } | undefined): OverlayAnchor {
  const w = Math.max(1, opts.defaultSize?.width ?? 380)
  const h = Math.max(1, opts.defaultSize?.height ?? 520)
  const fracW = Math.min(0.9, w / 1920)
  const fracH = Math.min(0.9, h / 1080)
  return {
    fracX: clampFrac(pos?.fracX, (1 - fracW) / 2, 1 - fracW),
    fracY: clampFrac(pos?.fracY, (1 - fracH) / 2, 1 - fracH),
    fracW,
    fracH,
  }
}

function defaultAnchorFor(opts: PluginOverlayOptions): OverlayAnchor {
  return anchorFor(opts, opts.defaultPosition)
}

/** Register exactly one zone-change listener that fans out to every plugin
 *  overlay window. Per-plugin forwardZoneChangesTo would add one EventEmitter
 *  listener per plugin and trip Node's max-listeners warning past ~7 plugins;
 *  a single fan-out keeps it constant. */
function ensureZoneFanout(): void {
  if (zoneFanoutWired) return
  zoneFanoutWired = true
  onZoneChanged((zone) => {
    for (const ov of overlays.values()) {
      const win = ov.getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('zone-changed', zone)
    }
  })
}

/** Shared tail: map-check, register, store, wire zone fanout + log forwarding.
 *  Both public register functions delegate here with their specific spec. */
function registerPluginOverlayInternal(pluginId: string, spec: OverlaySpec): SecondaryOverlay {
  const existing = overlays.get(pluginId)
  if (existing) return existing
  const overlay = registerSecondaryOverlay({
    ...spec,
    // Tell the plugin's own window when the user opens or closes it. The
    // overlay is hidden by dropping its opacity, not by destroying the window
    // (installOpacityHideShow), so the plugin's renderer stays mounted and has
    // no DOM-level way to notice - no visibilitychange, and the window is
    // never focused. This IPC is that signal. Lazy lookup because the map
    // entry is written just below, after registerSecondaryOverlay returns.
    onVisibilityChange: (visible) => {
      const win = overlays.get(pluginId)?.getWindow()
      if (!win || win.isDestroyed()) return
      win.webContents.send('plugin-overlay:visibility', visible)
    },
  })
  overlays.set(pluginId, overlay)
  ensureZoneFanout()
  // Log lines forward through a plain array (no EventEmitter listener limit),
  // so a per-plugin getter is fine. Lazy getter is safe before the window exists.
  const disposeLogForwarder = forwardLogLinesTo(() => overlays.get(pluginId)?.getWindow() ?? null)
  if (disposeLogForwarder) logForwardDisposers.set(pluginId, disposeLogForwarder)
  return overlay
}

export function registerPluginOverlay(pluginId: string, opts: PluginOverlayOptions): SecondaryOverlay {
  const sendEdgeFlush = (anchor: OverlayAnchor): void => {
    const win = overlays.get(pluginId)?.getWindow()
    if (!win || win.isDestroyed()) return
    win.webContents.send('plugin-overlay:edge-flush', flushEdges(anchor))
  }
  return registerPluginOverlayInternal(pluginId, {
    id: `plugin-overlay:${pluginId}`,
    htmlEntry: 'plugin-overlay.html',
    // Pinned by default: game-Esc must not dismiss a plugin card the user
    // placed (the Esc sweep also clears the alt-tab restore memory, so the
    // card would silently never come back). The chrome pin toggle opts out.
    defaultUserPinned: true,
    defaultAnchor: () => defaultAnchorFor(opts),
    snapAnchors: () => (opts.snapPositions ?? []).map((pos) => anchorFor(opts, pos)),
    storedAnchor: opts.storedAnchor,
    onAnchorChanged: (anchor) => {
      // The chrome squares its corners against whichever edge it now abuts.
      sendEdgeFlush(anchor)
      opts.onAnchorChanged?.(anchor)
    },
    onDidFinishLoad: (win) => {
      // Re-send after reload so the replacement renderer knows which plugin
      // module to import.
      win.webContents.send('plugin-overlay:init', pluginId)
      win.webContents.send('plugin-overlay:edge-flush', flushEdges(opts.storedAnchor?.() ?? defaultAnchorFor(opts)))
      sendCurrentZoneTo(win)
    },
  })
}

/** Full game window. Annotation overlays span the whole game so the plugin can
 *  position elements anywhere in game CSS coordinates. */
function fullGameAnchor(): OverlayAnchor {
  return { fracX: 0, fracY: 0, fracW: 1, fracH: 1 }
}

/** Register a plugin's annotation overlay: a transparent, click-through window
 *  spanning the full game window. The plugin draws absolutely-positioned
 *  elements (e.g. value labels next to a menu). Reuses the same overlays-map key
 *  as registerPluginOverlay, so open/close/dispose work unchanged. */
export function registerPluginAnnotationOverlay(pluginId: string): SecondaryOverlay {
  const overlay = registerPluginOverlayInternal(pluginId, {
    id: `plugin-overlay:${pluginId}`,
    htmlEntry: 'plugin-annotation-overlay.html',
    defaultAnchor: fullGameAnchor,
    onDidFinishLoad: (win) => {
      win.webContents.send('plugin-overlay:init', pluginId)
      sendCurrentZoneTo(win)
    },
    onFirstShow: (win) => {
      // The window must be click-through. installOpacityHideShow forces
      // setIgnoreMouseEvents(false) on every show, so set it now (the first show
      // already happened) and re-apply on each subsequent show, mirroring the
      // whiteboard's play-mode hook. forward:true still delivers mouse-move to
      // any plugin element that re-enables pointer-events.
      win.setIgnoreMouseEvents(true, { forward: true })
      win.on('show', () => {
        setImmediate(() => {
          if (!win.isDestroyed()) win.setIgnoreMouseEvents(true, { forward: true })
        })
      })
    },
  })
  // Click-through surface with no chrome and no close button - if the Esc
  // sweep hid it, the user would have no visible way to bring it back. Same
  // reasoning as the whiteboard's passthrough mode. Idempotent on re-register.
  overlay.setPersistOverOthers(true)
  return overlay
}

export function getPluginOverlay(pluginId: string): SecondaryOverlay | null {
  return overlays.get(pluginId) ?? null
}

export function togglePluginOverlay(pluginId: string): void {
  overlays.get(pluginId)?.toggle()
}

export function showPluginOverlay(pluginId: string): void {
  overlays.get(pluginId)?.show()
}

export function hidePluginOverlay(pluginId: string): void {
  overlays.get(pluginId)?.hide()
}

/** True when the plugin's popped-out overlay window exists and is currently
 *  visible. Used by auto-update to skip a pop-out the user is looking at. */
export function isPluginOverlayVisible(pluginId: string): boolean {
  return overlays.get(pluginId)?.isVisible() ?? false
}

/** Reload a plugin's popped-out overlay window if one exists, so it re-imports
 *  the new plugin.js after a dev update (the pop-out does not host PluginHost
 *  and would otherwise run stale code). No-op when there is no pop-out. */
export function reloadPluginOverlay(pluginId: string): void {
  overlays.get(pluginId)?.getWindow()?.webContents.reload()
}

/** Tear down on uninstall so the renderer and registration cannot survive into
 *  a same-session reinstall with stale code or overlay options. */
export function disposePluginOverlay(pluginId: string): void {
  const overlay = overlays.get(pluginId)
  if (!overlay) return
  overlay.destroy()
  overlays.delete(pluginId)
  logForwardDisposers.get(pluginId)?.()
  logForwardDisposers.delete(pluginId)
}

/** Test-only: clear the registry and re-arm the zone fan-out. */
export function _resetForTests(): void {
  for (const dispose of logForwardDisposers.values()) dispose()
  logForwardDisposers.clear()
  overlays.clear()
  zoneFanoutWired = false
}
