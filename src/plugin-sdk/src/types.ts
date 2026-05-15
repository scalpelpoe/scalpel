import type { PoeItem, Zone } from '../../shared/types'

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

export type PluginActivate = (ctx: ScalpelPluginContext) => void | Promise<void>

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

  registerTab(opts: RegisterTabOptions): void

  /**
   * Exposes a hotkey slot to Scalpel's app-macro settings. The plugin doesn't
   * pick the key; the user binds it themselves. Exactly one hotkey per plugin
   * in v1; calling registerHotkey a second time throws.
   */
  registerHotkey(opts: RegisterHotkeyOptions, handler: () => void): void

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
  openExternal(url: string): void
  log(...args: unknown[]): void
}
