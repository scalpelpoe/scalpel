import type { PoeItem, PriceEntry, Zone } from '../../shared/types'
export type { PriceEntry }

export interface PluginManifest {
  manifestVersion: 1
  id: string
  version: string
  name: string
  description: string
  author: string
  scalpelMinVersion: string
  homepage?: string
  poeVersions?: (1 | 2)[]
  tabIcon?: string
  /** Absolute URL of a small icon shown in the Plugins settings store rows.
   *  PNG or SVG. The same URL the registry entry advertises pre-install. */
  iconUrl?: string
  /** Public API exposed by this plugin's renderer entry point. */
  api?: {
    version: string
  }
  /** Explicit plugin API dependencies. No provider discovery is performed. */
  dependencies?: PluginDependency[]
}

export interface PluginDependency {
  pluginId: string
  apiVersion: string
  optional?: boolean
}

export type PluginApiHandler = (method: string, params: unknown) => unknown | Promise<unknown>

export interface PluginApiClient {
  readonly pluginId: string
  readonly apiVersion: string
  call<TResult = unknown, TParams = unknown>(method: string, params?: TParams): Promise<TResult>
}

export interface PluginCommunicationApi {
  /** Expose the API declared by this plugin's manifest. Must be called during activation. */
  expose(handler: PluginApiHandler): void
  /** Get a client for an explicitly declared dependency. */
  get(pluginId: string): PluginApiClient | null
}

/** Optional cleanup returned from activate(); the host calls it when the plugin
 *  is unloaded (uninstall or in-place update) so subscriptions/timers can be
 *  torn down. Mirrors RegisterTabOptions.render's cleanup-fn convention. */
export type PluginTeardown = () => void

export type PluginActivate = (ctx: ScalpelPluginContext) => PluginTeardown | void | Promise<PluginTeardown | void>

export interface RegisterTabOptions {
  /** Shown as the title-bar tooltip and in any "manage plugins" UI. */
  label: string
  /**
   * Inline SVG markup or a data URL. The host clamps the rendered icon to the
   * canonical 16x16 title-bar size and forces `display: flex` on any
   * descendant SVG, so plugin authors don't need to set width / height /
   * `display`. For a Scalpel-matched look, render an iconpark component to a
   * string at activation time (see PLUGINS.md "Tab icons").
   */
  icon: string
  /**
   * Called once when the tab is first shown. Plugin owns the container's
   * contents and may return a cleanup function called on unmount.
   */
  render: (container: HTMLElement) => (() => void) | void
}

export interface RegisterOverlayOptions {
  /** Shown in the overlay window's chrome title bar. */
  title: string
  /**
   * Optional inline SVG markup or data URL for the launch button rendered in
   * the plugin's main-overlay tab header. Same 16x16 clamping as
   * RegisterTabOptions.icon. Only shown if the plugin also registers a tab.
   */
  icon?: string
  /**
   * When set, exposes a dedicated overlay-toggle hotkey slot in Scalpel's
   * app-macro settings, separate from registerHotkey's action hotkey. The user
   * binds the key; this is the label shown in the settings row.
   */
  hotkeyLabel?: string
  /** Initial window size in CSS px. Falls back to a Scalpel default if absent. */
  defaultSize?: { width: number; height: number }
  /**
   * Where the overlay first appears, as fractions of the game window (the
   * window's top-left corner). Omit for Scalpel's centered default. Each
   * fraction is clamped so the window stays fully on the game window - fracX to
   * 0..(1 - the window's fractional width), fracY likewise - so a position past
   * the far edge is pulled back rather than left off-screen. A non-finite value
   * falls back to centering on that axis. This is also the window's snap-home,
   * so a drag-snap returns it here. Ignored in 'annotation' mode, which always
   * spans the game window,
   * and ignored once the user has moved the window - the moved position is
   * remembered from then on.
   */
  defaultPosition?: { fracX: number; fracY: number }
  /**
   * Additional drag-snap homes besides defaultPosition, in the same fractional
   * coordinates and sized like it from defaultSize. While dragging, the
   * nearest home (defaultPosition included) shows the snap ghost and wins on
   * drop. A home flush against the game window's left or right edge (fracX of
   * 0, or 1 clamped back to flush) mounts the window there: it stays flush at
   * the window's current size, and the chrome squares its corners on the
   * mounted side. Ignored in 'annotation' mode.
   */
  snapPositions?: { fracX: number; fracY: number }[]
  /**
   * Overlay surface kind. 'window' (default) is the chrome'd, draggable,
   * snap-anchored window. 'annotation' is a borderless, transparent,
   * click-through surface locked to the full game window: `render`'s container
   * is sized to the game window in CSS px and the plugin absolutely-positions
   * its own elements (e.g. value labels next to a menu). In annotation mode
   * `defaultSize` is ignored (the surface always spans the game window).
   */
  mode?: 'window' | 'annotation'
}

export interface PluginStorage {
  get<T = unknown>(key: string): Promise<T | null>
  set<T = unknown>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

export interface RegisterHotkeyOptions {
  /** Shown in the app-macro settings list (e.g. "Quick check"). */
  label: string
}

export interface GameConfigApi {
  /** Read the detected game's config ini. Rejects if the file is missing. */
  read(): Promise<{ content: string; path: string }>
  /**
   * Atomically overwrite the whole config file. On the first write of a session
   * a timestamped `.bak` is created beside it; `backupPath` is that path, or
   * null when no backup was written.
   */
  write(content: string): Promise<{ backupPath: string | null }>
  /**
   * Fire when the file changes on disk underneath you (the game rewriting it on
   * exit, an external editor, ...). Debounced; does not fire for your own
   * `write`. Returns an unsubscribe function.
   */
  onChange(handler: () => void): () => void
}

export interface GameRect {
  x: number
  y: number
  width: number
  height: number
}

export interface GameCapture {
  /** RGBA, row-major, length === width * height * 4. Drop into `new ImageData(...)`. */
  pixels: Uint8ClampedArray
  /** Captured-frame dimensions in frame px (downscaled from physical on tall windows). */
  width: number
  height: number
  /** Top-left of the captured frame in game CSS px. {x:0,y:0} for a full-window capture. */
  origin: { x: number; y: number }
  /** Full game window size in CSS px. An annotation overlay spans exactly this. */
  gameSize: { width: number; height: number }
  /** Captured frame px per game CSS px. Place a label: cssX = origin.x + boxFramePx.x / scale. */
  scale: number
}

export interface PricesApi {
  /**
   * Read the current poe.ninja price snapshot for the detected game + league.
   * Pass `category` to scope the result (e.g. `'currency'`); omit it for every
   * priced item. `category === 'currency'` returns the currency orbs in both
   * PoE1 and PoE2 (guaranteed); other slugs are ninja-derived per game.
   * `updatedAt` is the epoch-ms of the last successful host fetch, or null.
   */
  getPrices(opts?: { category?: string }): Promise<{ prices: PriceEntry[]; updatedAt: number | null }>
  /** Force the host to refetch ninja now, bypassing its cache TTL. */
  refresh(): Promise<void>
  /**
   * Fire after the host price snapshot refreshes (e.g. after `refresh()` or the
   * host's own periodic refetch completes). Does not fire on initial
   * subscription. Returns an unsubscribe function.
   */
  onChange(handler: () => void): () => void
}

export interface MediaSession {
  /** The source player's app id as Windows reports it, e.g. `'Spotify.exe'`. */
  sourceAppId: string
  title: string
  artist: string
  album: string
  /** Album art as a `data:` URL (png/jpeg), or null when the player publishes none. */
  thumbnail: string | null
  playing: boolean
  /** Track position/length in seconds. Both 0 when the player publishes no timeline. */
  position: number
  duration: number
  /**
   * Epoch-ms when `position` was last reported. While `playing`, the live
   * position is `position + (Date.now() - positionAt) / 1000`; players push
   * timeline updates sparsely (Spotify roughly every 5s), so interpolate
   * between events rather than waiting for the next one.
   */
  positionAt: number
}

export interface MediaApi {
  /**
   * The session Windows considers current (the one the hardware media keys
   * would control). Resolves null when no player is registered with the
   * system media controls, and always on non-Windows hosts.
   */
  getSession(): Promise<MediaSession | null>
  /**
   * Fires with the full new state whenever the current session changes:
   * track/metadata changes, play/pause, timeline updates, the player closing
   * (null) or another player taking over. Does not fire on initial
   * subscription - call getSession() for the starting state. Returns an
   * unsubscribe function.
   */
  onChange(handler: (session: MediaSession | null) => void): () => void
  /** Toggle play/pause via the system media key. Fire-and-forget; the state change arrives through onChange. */
  playPause(): void
  /** Skip to the next track via the system media key. */
  next(): void
  /** Skip to the previous track via the system media key. */
  previous(): void
}

export interface ScalpelPluginContext {
  readonly pluginId: string
  readonly pluginVersion: string
  readonly plugins: PluginCommunicationApi

  getPoeVersion(): 1 | 2
  getLeague(): string
  /**
   * The league list for a game (defaults to the detected game), read live from
   * the host each call so it is correct on league-launch day. Returns the same
   * list Scalpel's own League setting offers: the host-fetched trade-API list,
   * or the bundled fallback before the host has fetched. Both games' lists are
   * always available regardless of which game is running, so a plugin running
   * PoE1 can still offer PoE2 leagues.
   */
  getLeagues(version?: 1 | 2): Promise<readonly string[]>
  // Snapshot accessors return the latest state at call time. Combine with the
  // matching onCurrent* subscribers for reactive code; use the accessors when
  // you just need a one-shot read (e.g. inside the render function).
  getCurrentItem(): PoeItem | null
  getCurrentZone(): Zone | null

  onCurrentItem(handler: (item: PoeItem) => void): () => void
  onCurrentZone(handler: (zone: Zone) => void): () => void
  onLeagueChange(handler: (league: string) => void): () => void

  /**
   * Subscribe to raw Client.txt lines as they are appended. The handler fires
   * once per new line, in order. Returns an unsubscribe function. Lines are the
   * raw log text (zone changes, level-ups, chat, whispers, trade, ...). Scalpel
   * does not parse these beyond what getCurrentZone already provides.
   */
  onLogLine(handler: (line: string) => void): () => void

  /**
   * The most recent buffered Client.txt lines (default: all buffered, up to
   * Scalpel's 200-line cap). Useful on plugin load to scan recent history
   * before the first onLogLine fires.
   */
  getRecentLogLines(count?: number): Promise<string[]>

  registerTab(opts: RegisterTabOptions): void

  /**
   * Exposes a hotkey slot to Scalpel's app-macro settings. The plugin doesn't
   * pick the key; the user binds it themselves. Exactly one hotkey per plugin
   * in v1; calling registerHotkey a second time throws.
   */
  registerHotkey(opts: RegisterHotkeyOptions, handler: () => void): void

  /**
   * Give this plugin a real Scalpel overlay window (chrome'd, draggable,
   * snap-anchored to the game) hosting `render`. Independent of registerTab: a
   * plugin may register a tab, an overlay, or both. Exactly one overlay per
   * plugin; a second call throws. `render` runs inside the overlay window's own
   * process and may return a cleanup function called on window teardown.
   */
  registerOverlay(opts: RegisterOverlayOptions, render: (container: HTMLElement) => (() => void) | void): void

  /** Open (show) this plugin's overlay window. No-op if no overlay registered. */
  openOverlay(): void

  /** Close (hide) this plugin's overlay window. No-op if not open / none registered. */
  closeOverlay(): void

  /**
   * Subscribe to this plugin's overlay window being opened or closed. Returns
   * an unsubscribe function.
   *
   * Closing an overlay does NOT unmount your `registerOverlay` render - Scalpel
   * hides the window rather than destroying it, so the same DOM (and any React
   * state in it) is still there when the user reopens. Nothing in the DOM
   * reflects that: the window stays visible to the OS and is never focused, so
   * `visibilitychange` and focus events don't fire. Use this when reopening
   * should feel like a fresh start - clearing stale input, resetting a form,
   * restoring focus to your main field.
   *
   * Fires only on a real change, and only for deliberate opens and closes. The
   * transient hide when the user alt-tabs out of PoE (and the matching restore
   * when they come back) is not reported - that isn't the user closing your
   * window, and resetting there would discard work they still want. The first
   * open after the window is created isn't reported either; your render has
   * only just mounted at that point, so it is already in its initial state.
   *
   * Only meaningful inside the overlay window itself - inert when your plugin
   * code is running in Scalpel's main overlay.
   */
  onOverlayVisibility(handler: (visible: boolean) => void): () => void

  /**
   * Annotation overlays only. Declare the screen region (in overlay/game CSS px,
   * measured from the overlay's top-left) that should receive mouse input. While
   * the cursor is inside it, Scalpel flips the otherwise click-through overlay
   * interactive so clicks land on your elements; everywhere else the overlay
   * stays click-through and clicks pass to the game. Pass null to clear it. Call
   * this from your overlay's render code (re-call when the region moves or
   * resizes); it is a no-op for 'window'-mode overlays, which are already
   * interactive.
   */
  setInteractiveRegion(rect: { x: number; y: number; width: number; height: number } | null): void

  /**
   * Trigger the same flow Scalpel's main hotkey runs: send Ctrl+C to PoE,
   * read the clipboard, parse the item, fire onCurrentItem for everyone
   * (other plugins + Scalpel's filter/price-check views), and resolve to
   * the parsed item. Returns null when the clipboard doesn't contain a
   * recognisable PoE item.
   *
   * `opts.showOverlay` defaults to true, opening Scalpel's main overlay after
   * a successful capture. A plugin with its own overlay will usually want
   * `false` here, otherwise Scalpel's main overlay opens on top of it.
   *
   * `opts.dispatch` defaults to true. Set it to `false` for a private read: the
   * parsed item is returned to the caller alone, Scalpel's filter and
   * price-check views do not update, other plugins' `onCurrentItem` does not
   * fire, and no filter needs to be loaded (a plugin-only read doesn't require
   * one). Use this when your plugin wants the hovered item without touching
   * anyone else's view.
   */
  copyAndEvaluateItem(opts?: { showOverlay?: boolean; dispatch?: boolean }): Promise<PoeItem | null>

  /**
   * Capture the focused game window as raw RGBA pixels for the plugin to OCR or
   * pixel-inspect itself. Resolves to null when PoE is not focused (the capture
   * is scoped to the game window and never grabs the rest of the desktop). Pass
   * `region` (game CSS px) to capture and return only a sub-rectangle; omit it
   * for the whole window. One-shot - call it when you need a frame (e.g. from
   * your registered hotkey while the target menu is open).
   */
  captureGameWindow(region?: GameRect): Promise<GameCapture | null>

  /**
   * The cursor's position in game CSS px, measured from the game window's
   * top-left - the same coordinate space as setInteractiveRegion and
   * GameCapture.origin, so an annotation overlay can position against it
   * directly. Resolves to null when PoE is not focused or the cursor is
   * outside the game window. One-shot: call it from your hotkey handler.
   */
  getCursorPosition(): Promise<{ x: number; y: number } | null>

  /**
   * Switch the overlay to this plugin's tab. No-op if the tab isn't
   * registered yet.
   */
  openTab(): void

  fetch: typeof fetch
  storage: PluginStorage
  /**
   * Read / write / watch the running game's `_Config.ini`. The host resolves the
   * path from the detected PoE version; plugins cannot name a path. This is the
   * only file a plugin can touch on disk.
   */
  readonly gameConfig: GameConfigApi
  /**
   * Read the poe.ninja price data Scalpel already maintains (the same source
   * powering Price Check). Read-only; the host owns fetching, so plugins never
   * hit ninja directly (a renderer fetch would be CORS-blocked).
   */
  readonly prices: PricesApi
  /**
   * What Windows is currently playing (Spotify, a browser tab, any player
   * registered with the system media transport controls) plus transport
   * control. Commands are synthesized system media keys, so they reach
   * whichever player is current without any account or player-specific API.
   * Windows only: on Linux getSession resolves null and commands are no-ops.
   */
  readonly media: MediaApi
  openExternal(url: string): void
  log(...args: unknown[]): void
}
