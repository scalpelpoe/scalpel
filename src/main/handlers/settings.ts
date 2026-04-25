import { ipcMain } from 'electron'
import Store from 'electron-store'
import { loadFilter, getColorFrequencies } from '../filter-state'
import { getOverlayWindow, setCloseOnClickOutside } from '../overlay'
import { getAppWindow } from '../app-window'
import { setHotkey, setPriceCheckHotkey, setChatCommands, setAppMacros, setStashScrollEnabled } from '../hotkeys'
import { setOpenSide } from '../evaluation'
import { refreshPrices } from '../trade/prices'
import type { AppSettings, RegexPreset } from '../../shared/types'

export function register(store: Store<AppSettings>): void {
  ipcMain.handle('get-settings', () => store.store)

  ipcMain.handle('get-color-frequencies', () => getColorFrequencies())

  ipcMain.handle('refresh-prices', async () => {
    await refreshPrices(store.get('league'))
  })

  ipcMain.handle('set-setting', (event, key: keyof AppSettings, value: AppSettings[typeof key]) => {
    const prev = store.get(key)
    store.set(key, value)
    if (key === 'filterPath' && value !== prev) loadFilter(value as string, 'Switched Filters')
    if (key === 'hotkey') setHotkey(value as string)
    if (key === 'priceCheckHotkey') setPriceCheckHotkey(value as string)
    if (key === 'closeOnClickOutside') setCloseOnClickOutside(value as boolean)
    if (key === 'league') refreshPrices(value as string)
    if (key === 'chatCommands') setChatCommands(value as Array<{ hotkey: string; command: string }>)
    if (key === 'appMacros') setAppMacros(value as Array<{ action: string; hotkey: string; tag?: string }>)
    if (key === 'stashScrollEnabled') setStashScrollEnabled(value as boolean)
    if (key === 'openSide') setOpenSide(value as AppSettings['openSide'])

    // Broadcast setting change to all windows except the sender
    const sender = event.sender
    for (const win of [getOverlayWindow(), getAppWindow()]) {
      if (win && win.webContents !== sender) {
        win.webContents.send('setting-updated', key, value)
      }
    }
  })

  ipcMain.handle('get-regex-presets', () => {
    return (store.get('regexPresets') as RegexPreset[] | undefined) ?? []
  })

  ipcMain.handle('save-regex-preset', (_event, preset: RegexPreset) => {
    const presets = (store.get('regexPresets') as RegexPreset[] | undefined) ?? []
    const existingIdx = presets.findIndex((p) => p.id === preset.id)
    if (existingIdx >= 0) {
      presets[existingIdx] = preset
    } else {
      presets.push(preset)
    }
    store.set('regexPresets', presets)
    return presets
  })

  ipcMain.handle('delete-regex-preset', (_event, id: string) => {
    const presets = (store.get('regexPresets') as RegexPreset[] | undefined) ?? []
    const filtered = presets.filter((p) => p.id !== id)
    store.set('regexPresets', filtered)
    return filtered
  })

  ipcMain.handle('reorder-regex-presets', (_event, ids: string[]) => {
    const presets = (store.get('regexPresets') as RegexPreset[] | undefined) ?? []
    const byId = new Map(presets.map((p) => [p.id, p]))
    const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as RegexPreset[]
    store.set('regexPresets', reordered)
    return reordered
  })
}
