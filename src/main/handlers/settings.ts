import { ipcMain } from 'electron'
import Store from 'electron-store'
import { loadFilter, getColorFrequencies } from '../filter-state'
import { getOverlayWindow, setCloseOnClickOutside, setOverlayScale } from '../overlay'
import { getAppWindow } from '../app-window'
import { setHotkey, setPriceCheckHotkey, setChatCommands, setStashScrollEnabled } from '../hotkeys'
import { refreshPrices } from '../trade/prices'
import type { AppSettings } from '../../shared/types'

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
    if (key === 'overlayScale') setOverlayScale(value as number)
    if (key === 'chatCommands') setChatCommands(value as Array<{ hotkey: string; command: string }>)
    if (key === 'stashScrollEnabled') setStashScrollEnabled(value as boolean)

    // Broadcast setting change to all windows except the sender
    const sender = event.sender
    for (const win of [getOverlayWindow(), getAppWindow()]) {
      if (win && win.webContents !== sender) {
        win.webContents.send('setting-updated', key, value)
      }
    }
  })
}
