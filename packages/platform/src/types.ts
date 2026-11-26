import type { BrowserWindow, BrowserWindowConstructorOptions, NativeImage, Point, Rectangle } from 'electron'

/** The desktop integration selected for this process. */
export type BackendId = 'windows' | 'macos' | 'x11' | 'window' | 'hyprland' | 'layer-shell' | 'kwin-layer-shell'

/** A compositor proven to be running from runtime facts (socket or CLI), used
 *  when the environment does not name the desktop. */
export type RuntimeDesktop = 'hyprland' | 'niri' | 'sway' | 'umbriel'

/** Process facts backend selection depends on. */
export interface PlatformEnv {
  platform: NodeJS.Platform
  env: Record<string, string | undefined>
  argv: readonly string[]
  /** Resolved by `currentEnv()` from compositor sockets/CLI. `null` means
   *  probed with no match; `undefined` (hand-built test envs) skips probing. */
  runtimeDesktop?: RuntimeDesktop | null
}

/** Minimal per-window facts a compositor reports for game-mode detection. */
export interface CompositorWindowInfo {
  readonly title: string
  readonly xwayland?: boolean
}

export interface Traits {
  /** The compositor, rather than the overlay window library, owns overlay
   *  focus, stacking and visibility. Overlays hide by unmapping, focus moves
   *  through compositor requests, and pointer hit tests read
   *  `cursor.trackerPoint()` because hook coordinates are unreliable. */
  readonly compositorFocus: boolean
  /** A regular focusable window: no game attach, click-through, or input shaping. */
  readonly windowLocal?: boolean
}

export interface InputKeyEvent {
  keycode: number
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

/** Pointer positions are in the window tracker's coordinate space, the same
 *  space as `windowTracker.targetBounds`. */
export interface InputMouseEvent {
  x: number
  y: number
  button: unknown
}

export interface InputWheelEvent {
  x: number
  y: number
  rotation: number
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export interface InputEvents {
  keydown: (event: InputKeyEvent) => void
  keyup: (event: InputKeyEvent) => void
  mousedown: (event: InputMouseEvent) => void
  mouseup: (event: InputMouseEvent) => void
  mousemove: (event: InputMouseEvent) => void
  wheel: (event: InputWheelEvent) => void
}

/** Global key and mouse hooks plus key injection. Key codes are `Key` values. */
export interface InputHook {
  on<K extends keyof InputEvents>(event: K, listener: InputEvents[K]): void
  start(): void
  stop(): void
  keyTap(key: number, modifiers?: number[]): void
  keyToggle(key: number, state: 'down' | 'up'): void
  /** Send a whole combo as one coherent sequence, resolving when it has been
   *  handed to the OS. Modifiers first, the main key last. */
  injectCombo(keys: readonly number[]): Promise<void>
  /** Whether `keyToggle` can hold a key down across calls. When false (wtype),
   *  a combo must go out through `injectCombo`. */
  readonly holdsKeys: boolean
  /** Whether listeners also receive the keys this process injects. */
  readonly seesInjectedKeys: boolean
  /** Whether the user physically holds `key`, or null when injected keys make
   *  that unknowable. */
  physicallyHeld(key: number): boolean | null
}

/** OS-level shortcuts that fire while another application has focus. */
export interface GlobalShortcuts {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
  unregisterAll(): void
  isRegistered(accelerator: string): boolean
}

export interface Clipboard {
  readText(): string
  readHTML(): string
  writeText(text: string): void
  write(data: { text?: string; html?: string }): void
  clear(): void
  read(format: string): string
  readBuffer(format: string): Buffer
  readImage(): NativeImage
}

/** A captured game-window frame. `data` is BGRA, row-major, (0,0) at the game
 *  window's top-left. `width`/`height` are the frame's px dimensions (downscaled
 *  from physical when the window is taller than the capture cap). `gameSize`
 *  is the full game window in CSS px; `scale` is captured-frame px per CSS px. */
export interface CaptureFrame {
  data: Buffer
  width: number
  height: number
  gameSize: { width: number; height: number }
  scale: number
}

/** Which gate closed on a grab that produced nothing. Every one of these used to
 *  be an indistinguishable `null`, which is exactly why the radial backdrop's
 *  intermittent failure took a developer panel to find. */
export type CaptureFailure = 'focus' | 'bounds' | 'no-source' | 'empty-frame' | 'geometry' | 'error'

export type CaptureResult = { frame: CaptureFrame } | { frame: null; failure: CaptureFailure }

export interface CaptureOptions {
  /** Skip the "is the game the foreground window" check.
   *
   *  ONLY for callers that have already established the game had focus at the
   *  moment the user asked for something, and are now racing their own overlay's
   *  show. `windowTracker.targetHasFocus` is derived from an event stream
   *  and flickers around overlay window show/hide - see the comment on
   *  getGameCursorPosition, which dropped this same gate for this same reason
   *  after it made cursor reads "intermittently and spuriously return null".
   *
   *  The privacy invariant the gate exists for is not weakened by that: the only
   *  user of this flag is the radial backdrop, whose capture can only be reached
   *  from inside a radial open, which only happens on a hotkey that the app
   *  macro dispatch already gated on the game being the active context. The
   *  frame is grabbed because the user just pressed a key into the game, not
   *  ambiently.
   *
   *  Every other caller - panel detection's polling, the plugin capture API -
   *  is ambient and must keep the gate. */
  skipFocusGate?: boolean
  /** Active profile's game title. Lets compositor capture pick the right PoE
   *  window when both variants are open, without changing X11/Windows callers. */
  title?: string
}

/** A capturable window source for a live stream of the game. */
export interface GameWindowSource {
  sourceId: string
  gameSize: { w: number; h: number }
}

export interface GameCapture {
  captureGame(opts?: CaptureOptions): Promise<CaptureResult>
  /** The window source whose title matches `title`, for a renderer-side stream. */
  gameWindowSource(title: string): Promise<GameWindowSource | null>
}

export interface Cursor {
  /** Pointer position in Electron DIP, or null when it cannot be read. */
  screenPoint(): Point | null
  /** Pointer position in the tracker's coordinate space for backends with
   *  `traits.compositorFocus`; null elsewhere, where hook events carry it. */
  trackerPoint(): Point | null
  /** Moves the pointer to a DIP point. A no-op where unsupported. */
  warpTo(point: Point): void
}

export interface AttachEvent {
  hasAccess?: boolean
  isFullscreen?: boolean
  titleIndex: number
  x: number
  y: number
  width: number
  height: number
}

export interface FullscreenEvent {
  isFullscreen: boolean
}

export interface MoveresizeEvent {
  x: number
  y: number
  width: number
  height: number
}

export interface TrackerEventMap {
  attach: (event: AttachEvent) => void
  detach: () => void
  focus: () => void
  blur: () => void
  fullscreen: (event: FullscreenEvent) => void
  moveresize: (event: MoveresizeEvent) => void
}

export interface TrackerEvents {
  on<K extends keyof TrackerEventMap>(event: K, listener: TrackerEventMap[K]): void
}

/** Interactive region in a window's own CSS pixels. Native layer-shell
 *  surfaces use it to open their input region; X11 ignores it. */
export interface InputRect {
  left: number
  top: number
  width: number
  height: number
}

/** Finds the game window, follows its bounds and focus, and keeps the attached
 *  main overlay window over it. */
export interface WindowTracker {
  readonly events: TrackerEvents
  /** Game window bounds in the tracker's coordinate space (physical pixels on
   *  Windows and X11). Zero-sized before a game window is found. */
  readonly targetBounds: Rectangle
  readonly targetHasFocus: boolean
  /** Game window bounds in Electron DIP, or null without a game window. */
  gameBounds(win?: BrowserWindow | null): Rectangle | null
  /** Attaches the main overlay window to the first game window matching one of
   *  `titles`. Call once. */
  attach(win: BrowserWindow, titles: string[]): void
  setTargetTitles(titles: string[]): void
  focusTarget(): void
  /** Gives the attached main overlay window input focus. */
  activateOverlay(): void
  /** Gives a visible overlay window input focus. */
  focusOverlay(win: BrowserWindow): void
  /** Whether focus is still within the game context, so input may be sent. */
  inputAllowed(): boolean
  /** Constructor options for windows the backend manages as overlays. */
  overlayWindowOptions(): BrowserWindowConstructorOptions
  /** Prepares a newly constructed overlay window for the backend. */
  adoptOverlay(win: BrowserWindow): void
  /** Sets the window's interactive regions, in CSS pixels. */
  setInputRects(win: BrowserWindow, rects: readonly InputRect[]): void
  /** Called right before an overlay window is shown over the game. */
  beforeOverlayShow(win: BrowserWindow, gameTitle: string): void
}

export interface Platform {
  readonly id: BackendId
  readonly traits: Traits
  readonly input: InputHook
  readonly shortcuts: GlobalShortcuts
  readonly clipboard: Clipboard
  readonly capture: GameCapture
  readonly cursor: Cursor
  readonly windowTracker: WindowTracker
  /** Whether this process runs with administrator rights. */
  isElevated(): boolean
}

/** Process-wide services a backend can replace. A session that hides its
 *  clipboard from unfocused windows, has no global shortcut service, or cannot
 *  be driven through uiohook supplies its own implementation here. */
export interface BackendServices {
  readonly input: InputHook
  readonly shortcuts: GlobalShortcuts
  readonly clipboard: Clipboard
}

/** The parts of a platform that differ between backends. Services are optional:
 *  every backend uses the shared Electron/uiohook implementations unless it
 *  needs to replace one of them. */
export type Backend = Pick<Platform, 'traits' | 'capture' | 'cursor' | 'windowTracker'> & {
  readonly services?: Partial<BackendServices>
}
