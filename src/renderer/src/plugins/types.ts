import type { PoeItem, Zone } from '@shared/types'

export type PluginContextFactoryDeps = {
  pluginId: string
  pluginVersion: string
  getPoeVersion: () => 1 | 2
  getLeague: () => string
  getCurrentItem: () => PoeItem | null
  getCurrentZone: () => Zone | null
  subscribeCurrentItem: (h: (i: PoeItem) => void) => () => void
  subscribeCurrentZone: (h: (z: Zone) => void) => () => void
  subscribeLeagueChange: (h: (l: string) => void) => () => void
  onLogLine: (handler: (line: string) => void) => () => void
  getRecentLogLines: (count?: number) => Promise<string[]>
  openExternal: (url: string) => void
  storage: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
    keys: () => Promise<string[]>
  }
  gameConfig: {
    read: () => Promise<{ content: string; path: string }>
    write: (content: string) => Promise<{ backupPath: string | null }>
    onChange: (handler: () => void) => () => void
  }
  prices: {
    getPrices: (opts?: {
      category?: string
    }) => Promise<{ prices: import('@shared/types').PriceEntry[]; updatedAt: number | null }>
    refresh: () => Promise<void>
    onChange: (handler: () => void) => () => void
  }
  registerTab: (
    pluginId: string,
    opts: {
      label: string
      icon: string
      render: (container: HTMLElement) => (() => void) | void
    },
  ) => void
  registerHotkey: (pluginId: string, opts: { label: string }, handler: () => void) => void
  openTab: (pluginId: string) => void
  copyAndEvaluateItem: () => Promise<import('@shared/types').PoeItem | null>
  captureGameWindow: (
    region?: import('../../../plugin-sdk/src/types').GameRect,
  ) => Promise<import('../../../plugin-sdk/src/types').GameCapture | null>
  registerOverlay: (pluginId: string, opts: import('../../../plugin-sdk/src/types').RegisterOverlayOptions) => void
  openOverlay: (pluginId: string) => void
  closeOverlay: (pluginId: string) => void
}
