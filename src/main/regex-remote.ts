import type { RegexPreset } from '../shared/types'
import type { PanelState } from '../shared/panel-state'
import { POE_SIDEBAR_RATIO } from '../shared/poe-geometry'
import { registerSecondaryOverlay, type OverlayAnchor, type Rect, type SecondaryOverlay } from './windowing'

export interface RegexRemoteApplyDeps {
  /** Presets for the currently active game (caller picks the poe1/poe2 store). */
  getPresets: () => RegexPreset[]
  /** Hand OS focus back to the PoE window before keystrokes are synthesized. */
  focusGame: () => void
  /** Paste the regex into PoE's search (the existing pasteRegexToSearch flow). */
  paste: (regex: string) => void
  /** Defer the paste until after focus settles. Real wiring uses setTimeout;
   *  tests pass a synchronous implementation. */
  defer: (fn: () => void) => void
}

// ---- Overlay registration ---------------------------------------------------

// The pad docks into the bottom-left corner: left edge flush with the stash
// tab sidebar (see leftDockFracX), bottom edge just above the in-game XP bar.
// XP_BAR_TOP_FRAC is the XP bar's top as a fraction of screen height (tunable
// by eye); the pad's bottom sits there and it extends upward by DOCK_FRAC_H.
const XP_BAR_TOP_FRAC = 0.95
const DOCK_FRAC_W = 0.16
const DOCK_FRAC_H = 0.4

/** Horizontal dock position (fraction of PoE window width) matching the left
 *  mount of the main Scalpel panel: its left edge sits at the right edge of
 *  PoE's left sidebar, whose width is `gameHeight * POE_SIDEBAR_RATIO`. Derived
 *  from PoE's bounds so it tracks the mount across aspect ratios. Falls back to
 *  a 16:9 estimate when PoE isn't attached (bounds unavailable). */
export function leftDockFracX(tb: { width: number; height: number } | null | undefined): number {
  if (!tb || tb.width <= 0 || tb.height <= 0) return POE_SIDEBAR_RATIO / (16 / 9)
  return (tb.height * POE_SIDEBAR_RATIO) / tb.width
}

/** Snap target that pins the pad's BOTTOM-LEFT corner: left edge at the dock X,
 *  bottom edge at the dock's bottom (just above the XP bar). Resizing the pad
 *  grows it upward instead of drifting the bottom. `defaultRect` is the dock's
 *  full DIP rect; `cur` is the window's current size. */
export function bottomLeftSnapTarget(defaultRect: Rect, cur: Rect): Rect {
  return {
    x: defaultRect.x,
    y: defaultRect.y + defaultRect.height - cur.height,
    width: cur.width,
    height: cur.height,
  }
}

// Vendor dock: the pad sits in the upper-right area beside PoE's Buy/Sell modal
// (which is wider than the stash sidebar). Unlike the stash dock it is NOT
// pinned to the XP bar - it sits higher so it doesn't cover the vendor search
// box / flasks. Both fractions of the PoE window; tuned by eye for 16:9 -
// adjust in-game.
const VENDOR_DOCK_FRAC_X = 0.505
const VENDOR_DOCK_FRAC_Y = 0.4

/** The pad's left-edge dock X (fraction of PoE width) for the current context.
 *  Empirically the panel detector reports leftPanelOpen=true at the stash (its
 *  header matches the left-panel samples) and false at a vendor's Buy/Sell
 *  window, so: stash -> sidebar-flush dock (leftDockFracX); vendor -> the wider
 *  dock further right (VENDOR_DOCK_FRAC_X). */
export function dockFracX(panel: PanelState, tb: { width: number; height: number } | null | undefined): number {
  return panel.leftPanelOpen ? leftDockFracX(tb) : VENDOR_DOCK_FRAC_X
}

/** Context-aware dock anchor (see dockFracX for the stash-vs-vendor mapping).
 *  Stash dock is pinned to the bottom (just above the XP bar); the vendor dock
 *  sits higher in the upper-right beside the Buy/Sell modal. */
export function regexRemoteAnchor(
  panel: PanelState,
  tb: { width: number; height: number } | null | undefined,
): OverlayAnchor {
  return {
    fracX: dockFracX(panel, tb),
    fracY: panel.leftPanelOpen ? XP_BAR_TOP_FRAC - DOCK_FRAC_H : VENDOR_DOCK_FRAC_Y,
    fracW: DOCK_FRAC_W,
    fracH: DOCK_FRAC_H,
  }
}

let overlay: SecondaryOverlay | null = null

export function registerRegexRemoteOverlay(opts: {
  onAnchorChanged: (anchor: OverlayAnchor) => void
  getTargetBounds: () => { width: number; height: number } | null | undefined
  getPanelState: () => PanelState
}): SecondaryOverlay {
  if (overlay) return overlay
  overlay = registerSecondaryOverlay({
    id: 'regex-remote',
    htmlEntry: 'regex-remote.html',
    defaultAnchor: () => regexRemoteAnchor(opts.getPanelState(), opts.getTargetBounds()),
    snapTarget: bottomLeftSnapTarget,
    repositionOnShow: true,
    onAnchorChanged: opts.onAnchorChanged,
  })
  return overlay
}

export function getRegexRemoteOverlay(): SecondaryOverlay | null {
  return overlay
}

export function toggleRegexRemote(): void {
  overlay?.toggle()
}

/** Resolve a preset by id for the active game and apply its regex to PoE's
 *  search. Refocuses PoE first because a click on the pad window steals OS
 *  focus, which would otherwise send the synthetic Ctrl+F / Ctrl+V to the pad.
 *  No-ops on an unknown id or a preset with no regex. */
export function applyRegexPreset(presetId: string, deps: RegexRemoteApplyDeps): void {
  const preset = deps.getPresets().find((p) => p.id === presetId)
  if (!preset?.regex) return
  deps.focusGame()
  deps.defer(() => deps.paste(preset.regex as string))
}
