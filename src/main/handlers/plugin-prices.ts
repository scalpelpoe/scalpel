import { ipcMain } from 'electron'
import type { IpcMainEvent, WebContents } from 'electron'
import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import { getProfileBackedSetting } from '../profiles/profile-settings'
import { getPriceEntries, invalidatePriceCache, refreshPrices, subscribePriceUpdates } from '../trade/prices'

const subscribers = new Set<WebContents>()
let unsub: (() => void) | null = null

function removeSubscriber(wc: WebContents): void {
  if (!subscribers.delete(wc)) return
  if (subscribers.size === 0 && unsub) {
    unsub()
    unsub = null
  }
}

/** Register the read-only price capability backing `ctx.prices`. Reuses the
 *  main-process price cache (the same one Price Check uses); plugins never fetch
 *  ninja directly (renderer fetch is CORS-blocked). */
export function registerPluginPriceHandlers(store: Store<AppSettings>): void {
  ipcMain.handle('plugins:prices-get', async (_evt, opts?: { category?: string }) => {
    await refreshPrices(getProfileBackedSetting(store, 'league'))
    return getPriceEntries(opts?.category)
  })

  ipcMain.handle('plugins:prices-refresh', async () => {
    invalidatePriceCache()
    await refreshPrices(getProfileBackedSetting(store, 'league'))
  })

  ipcMain.on('plugins:prices-watch', (evt: IpcMainEvent) => {
    const wc = evt.sender
    if (subscribers.has(wc)) return
    subscribers.add(wc)
    wc.once('destroyed', () => removeSubscriber(wc))
    if (!unsub) {
      unsub = subscribePriceUpdates(() => {
        for (const w of subscribers) {
          if (!w.isDestroyed()) w.send('plugins:prices-changed')
        }
      })
    }
  })

  ipcMain.on('plugins:prices-unwatch', (evt: IpcMainEvent) => {
    removeSubscriber(evt.sender)
  })
}
