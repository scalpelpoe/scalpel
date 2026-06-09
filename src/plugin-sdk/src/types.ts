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

export interface ScalpelPluginContext {
  readonly pluginId: string
  readonly pluginVersion: string

  getPoeVersion(): 1 | 2
  getLeague(): string
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
   * Trigger the same flow Scalpel's main hotkey runs: send Ctrl+C to PoE,
   * read the clipboard, parse the item, fire onCurrentItem for everyone
   * (other plugins + Scalpel's filter/price-check views), and resolve to
   * the parsed item. Returns null when the clipboard doesn't contain a
   * recognisable PoE item.
   */
  copyAndEvaluateItem(): Promise<PoeItem | null>

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
  openExternal(url: string): void
  log(...args: unknown[]): void
}
