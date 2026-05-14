import type { PoeItem, Zone } from '../../../shared/types'

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
  openExternal: (url: string) => void
  storage: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
    keys: () => Promise<string[]>
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
  copyAndEvaluateItem: () => Promise<import('../../../shared/types').PoeItem | null>
}
