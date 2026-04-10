import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  FilterBlock,
  FilterListEntry,
  FilterVersion,
  HistoryEntry,
  OverlayData,
} from '../shared/types'

export const api = {
  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('get-settings'),
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> =>
    ipcRenderer.invoke('set-setting', key, value),
  pickFilterFile: (): Promise<string | null> => ipcRenderer.invoke('pick-filter-file'),
  pickFilterDir: (): Promise<string | null> => ipcRenderer.invoke('pick-filter-dir'),
  scanFilterDir: (dir: string): Promise<FilterListEntry[]> => ipcRenderer.invoke('scan-filter-dir', dir),
  scanSoundFiles: (dir: string): Promise<string[]> => ipcRenderer.invoke('scan-sound-files', dir),
  getSoundDataUrl: (dir: string, filename: string): Promise<string | null> =>
    ipcRenderer.invoke('get-sound-data-url', dir, filename),
  importOnlineFilter: (
    sourcePath: string,
    filterName: string,
    targetDir: string,
    force = false,
  ): Promise<{ ok: boolean; path?: string; error?: string; conflict?: boolean }> =>
    ipcRenderer.invoke('import-online-filter', sourcePath, filterName, targetDir, force),
  switchIngameFilter: (filterName: string, currentFilter?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('switch-ingame-filter', filterName, currentFilter),

  // Color frequencies
  getColorFrequencies: (): Promise<
    Record<string, Array<{ r: number; g: number; b: number; a: number; count: number; category: string }>>
  > => ipcRenderer.invoke('get-color-frequencies'),

  // Filter editing
  saveBlockEdit: (
    blockIndex: number,
    block: FilterBlock,
    itemJson?: string,
  ): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('save-block-edit', blockIndex, block, itemJson),
  reloadFilter: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('reload-filter'),
  lookupBaseType: (baseType: string, itemClass: string, rarity?: string, uniqueName?: string): Promise<void> =>
    ipcRenderer.invoke('lookup-base-type', baseType, itemClass, rarity, uniqueName),
  getDivCardTiers: (): Promise<{ colors: Record<string, string>; cardTiers: Record<string, string> }> =>
    ipcRenderer.invoke('get-div-card-tiers'),
  batchLookupDivCardPrices: (
    cardNames: string[],
    league: string,
  ): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> =>
    ipcRenderer.invoke('batch-lookup-div-card-prices', cardNames, league),
  batchLookupPrices: (
    baseTypes: string[],
    league: string,
    uniqueTier?: boolean,
  ): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> =>
    ipcRenderer.invoke('batch-lookup-prices', baseTypes, league, uniqueTier),
  moveItemTier: (
    baseType: string,
    fromBlockIndex: number,
    toBlockIndex: number,
    itemJson: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('move-item-tier', baseType, fromBlockIndex, toBlockIndex, itemJson),
  batchMoveItemTier: (
    baseTypes: string[],
    fromBlockIndex: number,
    toBlockIndex: number,
    itemJson: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('batch-move-item-tier', baseTypes, fromBlockIndex, toBlockIndex, itemJson),
  updateStackThresholds: (
    oldBoundary: number,
    newBoundary: number,
    itemJson: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('update-stack-thresholds', oldBoundary, newBoundary, itemJson),
  updateQualityThresholds: (
    oldBoundary: number,
    newBoundary: number,
    itemJson: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('update-quality-thresholds', oldBoundary, newBoundary, itemJson),
  updateStrandThresholds: (
    oldBoundary: number,
    newBoundary: number,
    itemJson: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('update-strand-thresholds', oldBoundary, newBoundary, itemJson),

  // History / undo
  getHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('get-history'),
  undoEdit: (itemJson?: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('undo-edit', itemJson),

  // Filter versions
  listVersions: (): Promise<FilterVersion[]> => ipcRenderer.invoke('list-versions'),
  createCheckpoint: (label?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('create-checkpoint', label),
  restoreVersion: (filename: string, itemJson?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('restore-version', filename, itemJson),
  deleteVersion: (filename: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-version', filename),

  // App window
  finishOnboarding: (): Promise<void> => ipcRenderer.invoke('finish-onboarding'),
  setAppWindowMode: (mode: 'onboarding' | 'settings'): void => ipcRenderer.send('app-window-mode', mode),

  // Overlay control
  closeOverlay: (): void => ipcRenderer.send('close-overlay'),
  reportPanelHeight: (height: number): void => ipcRenderer.send('report-panel-height', height),
  reportDragOffset: (x: number, y: number): void => ipcRenderer.send('report-drag-offset', x, y),
  reportPanelSide: (side: 'left' | 'right'): void => ipcRenderer.send('report-panel-side', side),
  lockInteractive: (): void => ipcRenderer.send('lock-interactive'),
  unlockInteractive: (): void => ipcRenderer.send('unlock-interactive'),
  refreshPrices: (): Promise<void> => ipcRenderer.invoke('refresh-prices'),

  // Event subscriptions
  onOverlayData: (cb: (data: OverlayData) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: OverlayData): void => cb(data)
    ipcRenderer.on('overlay-data', handler)
    return () => ipcRenderer.removeListener('overlay-data', handler)
  },
  onCursorSide: (cb: (side: 'left' | 'right') => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, side: 'left' | 'right'): void => cb(side)
    ipcRenderer.on('cursor-side', handler)
    return () => ipcRenderer.removeListener('cursor-side', handler)
  },
  onNoFilterLoaded: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('no-filter-loaded', handler)
    return () => ipcRenderer.removeListener('no-filter-loaded', handler)
  },
  onNoItemInClipboard: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('no-item-in-clipboard', handler)
    return () => ipcRenderer.removeListener('no-item-in-clipboard', handler)
  },
  onOpenSettings: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('open-settings', handler)
    return () => ipcRenderer.removeListener('open-settings', handler)
  },
  onOverlayHide: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('overlay-hide', handler)
    return () => ipcRenderer.removeListener('overlay-hide', handler)
  },
  onSettingUpdated: (cb: (key: string, value: unknown) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, key: string, value: unknown): void => cb(key, value)
    ipcRenderer.on('setting-updated', handler)
    return () => ipcRenderer.removeListener('setting-updated', handler)
  },
  onSkipAnimation: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('skip-animation', handler)
    return () => ipcRenderer.removeListener('skip-animation', handler)
  },
  onOverlayDetach: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('overlay-detach', handler)
    return () => ipcRenderer.removeListener('overlay-detach', handler)
  },
  onOverlayReattach: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('overlay-reattach', handler)
    return () => ipcRenderer.removeListener('overlay-reattach', handler)
  },
  onPriceCheckOpen: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('price-check-open', handler)
    return () => ipcRenderer.removeListener('price-check-open', handler)
  },
  onPriceCheck: (
    cb: (data: {
      item: import('../shared/types').PoeItem
      priceInfo?: import('../shared/types').PriceInfo
      statFilters: Array<{
        id: string
        text: string
        value: number | null
        min: number | null
        max: number | null
        enabled: boolean
        type: string
      }>
      league: string
      chaosPerDivine?: number
      unidCandidates?: Array<{ name: string; chaosValue: number }>
    }) => void,
  ): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, data: Parameters<typeof cb>[0]): void => cb(data)
    ipcRenderer.on('price-check', handler)
    return () => ipcRenderer.removeListener('price-check', handler)
  },
  tradeSearch: (
    item: {
      name: string
      baseType: string
      itemClass: string
      rarity: string
      armour?: number
      evasion?: number
      energyShield?: number
      ward?: number
      block?: number
    },
    statFilters: Array<{
      id: string
      text: string
      value: number | null
      min: number | null
      max: number | null
      enabled: boolean
      type: string
    }>,
  ): Promise<{
    total: number
    listings: Array<{
      id: string
      price: { amount: number; currency: string } | null
      account: string
      characterName?: string
      online: boolean
      instantBuyout: boolean
      icon?: string
      indexed?: string
      itemData?: { name?: string; baseType?: string; explicitMods?: string[]; implicitMods?: string[]; ilvl?: number }
    }>
    queryId: string
  }> => ipcRenderer.invoke('trade-search', item, statFilters),
  bulkExchange: (
    itemName: string,
    baseType: string,
    haveId?: string,
  ): Promise<{
    total: number
    listings: Array<{
      id: string
      account: string
      characterName?: string
      online: boolean
      stock: number
      pay: { amount: number; currency: string }
      get: { amount: number; currency: string }
      ratio: number
      whisper?: string
    }>
    queryId: string
  }> => ipcRenderer.invoke('bulk-exchange', itemName, baseType, haveId),
  checkBulkItem: (itemName: string, baseType: string, itemClass: string, rarity?: string): Promise<boolean> =>
    ipcRenderer.invoke('check-bulk-item', itemName, baseType, itemClass, rarity),
  visitHideout: (queryId: string, listingId: string, league: string): Promise<void> =>
    ipcRenderer.invoke('visit-hideout', queryId, listingId, league),
  whisperSeller: (queryId: string, listingId: string, league: string): Promise<void> =>
    ipcRenderer.invoke('whisper-seller', queryId, listingId, league),
  poeLogin: (): Promise<void> => ipcRenderer.invoke('poe-login'),
  poeCheckAuth: (): Promise<{ loggedIn: boolean; accountName?: string }> => ipcRenderer.invoke('poe-check-auth'),
  poeLogout: (): Promise<void> => ipcRenderer.invoke('poe-logout'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('open-external', url),
  onGameBounds: (
    cb: (bounds: { gameWidth: number; gameHeight: number; sidebarWidth: number }) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      bounds: { gameWidth: number; gameHeight: number; sidebarWidth: number },
    ): void => cb(bounds)
    ipcRenderer.on('game-bounds', handler)
    return () => ipcRenderer.removeListener('game-bounds', handler)
  },

  onElevationHint: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('elevation-hint', handler)
    return () => ipcRenderer.removeListener('elevation-hint', handler)
  },

  onRateLimit: (
    cb: (state: { tiers: Array<{ used: number; max: number; window: number; penalty: number }> }) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      state: { tiers: Array<{ used: number; max: number; window: number; penalty: number }> },
    ): void => cb(state)
    ipcRenderer.on('rate-limit', handler)
    return () => ipcRenderer.removeListener('rate-limit', handler)
  },

  // Online filter sync
  checkForOnlineUpdate: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('check-online-update'),
  quickUpdateFilter: (): Promise<{
    ok: boolean
    error?: string
    stats?: {
      unchanged: number
      upstreamOnly: number
      userOnly: number
      bothChanged: number
      added: number
      removed: number
    }
    conflicts?: Array<{ description: string; actionType: string }>
  }> => ipcRenderer.invoke('quick-update-filter'),
  mergeOnlineFilter: (
    onlineFilterName: string,
    onlinePath: string,
    localPath: string,
  ): Promise<{
    ok: boolean
    error?: string
    conflicts?: Array<{ description: string; actionType: string }>
    stats?: {
      unchanged: number
      upstreamOnly: number
      userOnly: number
      bothChanged: number
      added: number
      removed: number
    }
  }> => ipcRenderer.invoke('merge-online-filter', onlineFilterName, onlinePath, localPath),
  onOnlineFilterChanged: (cb: (changed: { path: string; name: string }[]) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, changed: { path: string; name: string }[]): void => cb(changed)
    ipcRenderer.on('online-filter-changed', handler)
    return () => ipcRenderer.removeListener('online-filter-changed', handler)
  },

  // Auto-update
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('download-update'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('install-update'),
  saveOverlayState: (state: Record<string, unknown>): void => ipcRenderer.send('save-overlay-state', state),
  onUpdateAvailable: (cb: (version: string) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, version: string): void => cb(version)
    ipcRenderer.on('update-available', handler)
    return () => ipcRenderer.removeListener('update-available', handler)
  },
  onUpdateDownloadProgress: (cb: (percent: number) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, percent: number): void => cb(percent)
    ipcRenderer.on('update-download-progress', handler)
    return () => ipcRenderer.removeListener('update-download-progress', handler)
  },
  onUpdateDownloaded: (cb: () => void): (() => void) => {
    const handler = (): void => cb()
    ipcRenderer.on('update-downloaded', handler)
    return () => ipcRenderer.removeListener('update-downloaded', handler)
  },
  onUpdateApplied: (cb: (version: string, state: Record<string, unknown> | null) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, version: string, state: Record<string, unknown> | null): void =>
      cb(version, state)
    ipcRenderer.on('update-applied', handler)
    return () => ipcRenderer.removeListener('update-applied', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
