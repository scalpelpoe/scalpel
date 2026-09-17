import { ipcMain, type WebContents } from 'electron'
import type { Zone } from '@shared/types'
import { addLogLineSubscriberRef, getRecentLogLines, removeLogLineSubscriberRef } from '../client-log/tail-buffer'
import { getCurrentZone } from '../client-log/zone-state'

/** IPC for the plugin log-tail surface. The renderer increments the subscriber
 *  ref-count on first onLogLine subscribe and decrements on last unsubscribe,
 *  so the main process only forwards lines when someone is listening. */
export function registerClientLogHandlers(): void {
  const subscriptions = new Map<WebContents, number>()
  const destructionHandlers = new Map<WebContents, () => void>()
  const detachDestructionHandlers = (webContents: WebContents): void => {
    const handler = destructionHandlers.get(webContents)
    if (handler) {
      webContents.removeListener('destroyed', handler)
      webContents.removeListener('render-process-gone', handler)
      destructionHandlers.delete(webContents)
    }
  }
  const removeSubscriptions = (webContents: WebContents): void => {
    const count = subscriptions.get(webContents) ?? 0
    subscriptions.delete(webContents)
    detachDestructionHandlers(webContents)
    for (let index = 0; index < count; index += 1) removeLogLineSubscriberRef()
  }

  ipcMain.handle('client-log:recent-lines', (_evt, count?: number): string[] => {
    return getRecentLogLines(typeof count === 'number' ? count : undefined)
  })
  ipcMain.handle('client-log:current-zone', (): Zone | null => getCurrentZone())
  ipcMain.on('client-log:subscribe', (event) => {
    const webContents = event.sender
    if (!subscriptions.has(webContents)) {
      const handler = (): void => removeSubscriptions(webContents)
      destructionHandlers.set(webContents, handler)
      webContents.once('destroyed', handler)
      webContents.once('render-process-gone', handler)
    }
    subscriptions.set(webContents, (subscriptions.get(webContents) ?? 0) + 1)
    addLogLineSubscriberRef()
  })
  ipcMain.on('client-log:unsubscribe', (event) => {
    const webContents = event.sender
    const count = subscriptions.get(webContents) ?? 0
    if (count === 0) return
    if (count === 1) {
      subscriptions.delete(webContents)
      detachDestructionHandlers(webContents)
    } else subscriptions.set(webContents, count - 1)
    removeLogLineSubscriberRef()
  })
}
