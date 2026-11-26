import type { BrowserWindow, WebPreferences } from 'electron'
import type { GlobalShortcuts } from '../../types'

/** Evdev input event delivered by a native overlay host. Shape matches the
 *  electron-overlay-window native Wayland addon; defined locally so the
 *  platform package compiles before the addon dependency is updated. */
export type NativeInputEvent =
  | { type: 'keydown' | 'keyup'; code: number }
  | { type: 'mousedown' | 'mouseup'; code: number }
  | { type: 'wheel'; delta: number; horizontal: boolean }

/**
 * Generic native-overlay boundary.
 *
 * Compositor-specific backends (KWin/KDE layer-shell, Hyprland, generic
 * wlr-layer-shell) register themselves here. Feature code only sees this
 * facade, so compositor-specific imports stay behind the backend.
 */

export interface OverlayRect {
  left: number
  top: number
  width: number
  height: number
}

export interface NativeOverlayServices {
  /** Stable backend id, used in breadcrumbs and diagnostics. */
  id: string
  /** Addon-provided WebPreferences needed by the backend. */
  webPreferences: WebPreferences
  /** Renderer flags for preload helpers tied to this backend. */
  additionalArguments?: readonly string[]
  /** Called once, immediately after an overlay BrowserWindow is constructed. */
  adoptWindow(win: BrowserWindow): void
  /** Interactive regions in window CSS pixels. */
  setInputRects(win: BrowserWindow, rects: readonly OverlayRect[]): void
  /** Backend shortcut implementation, when it replaces Electron/portal bindings. */
  globalShortcut?: GlobalShortcuts
  /** Clipboard through the compositor, when available. */
  clipboard?: {
    available(): boolean
    readText(): string
    readHTML(): string
    writeText(text: string): void
    write(data: { text?: string; html?: string }): void
    clear(): void
  }
  /** True while the game, not an overlay, owns keyboard focus. */
  gameHasKeyboardFocus?(): boolean
  /** Compositor-driven input, pointer and screencopy, never XWayland. */
  native: {
    listen(listener: (event: NativeInputEvent) => void): (() => void) | null
    inputDevices(): number
    key(code: number, pressed: boolean): boolean
    /** Backends that own a whole combo sequence (for example batched ydotool
     *  calls) can replace the generic press/release loop. Codes are evdev. */
    injectCombo?(codes: readonly number[]): Promise<void> | void
    warpPointer(point: { x: number; y: number }): boolean
    probePointer(): Promise<{ x: number; y: number } | null>
    canCapture(): boolean
    capture(rect: Electron.Rectangle): Promise<{ width: number; height: number; data: Buffer } | null>
  }
  /** Global logical pointer position while it is over an overlay surface. */
  overlayPointer?(): { x: number; y: number } | null
  /** Tracker bounds are already logical DIP; do not divide by display scale. */
  boundsAreLogical: boolean
  /** Capability flags surfaced in diagnostics/settings. */
  features: {
    screencopy: boolean
    cursorRefresh: boolean
    selectPopups: boolean
    ydotoolInput: boolean
    /** Desktop capturer would open the compositor's interactive source picker. */
    desktopCapturerSourcePickerUnsafe: boolean
  }
}

let services: NativeOverlayServices | null = null

/** The compositor input/pointer/capture surface a desktop adapter can override. */
export type NativeOverlayInput = NativeOverlayServices['native']
/** Capability flags surfaced in diagnostics/settings. */
export type NativeOverlayFeatures = NativeOverlayServices['features']

export function registerNativeOverlayBackend(next: NativeOverlayServices): void {
  services = next
}

export function unregisterNativeOverlayBackend(): void {
  services = null
}

export function nativeOverlayActive(): boolean {
  return services !== null
}

export function nativeOverlayBackendId(): string | null {
  return services?.id ?? null
}

export function nativeOverlayServices(): NativeOverlayServices | null {
  return services
}

/** Must be called right after constructing an overlay window, before any
 *  show/hide wrappers are installed. No-op outside a native overlay backend. */
export function adoptOverlayWindow(win: BrowserWindow): void {
  if (!services || win.isDestroyed()) return
  services.adoptWindow(win)
}

export function setOverlayInputRects(win: BrowserWindow, rects: readonly OverlayRect[]): void {
  if (!services || win.isDestroyed()) return
  services.setInputRects(win, rects)
}

export function overlayBoundsAreLogical(): boolean {
  return services?.boundsAreLogical ?? false
}

export function overlayGameHasKeyboardFocus(): boolean {
  return services?.gameHasKeyboardFocus?.() ?? false
}

export function nativeOverlayFeature<K extends keyof NativeOverlayServices['features']>(name: K): boolean {
  return services?.features[name] ?? false
}

/** @internal Test-only reset. */
export function __resetNativeOverlayBackendForTests(): void {
  unregisterNativeOverlayBackend()
}
