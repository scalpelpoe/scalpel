import type { WebContents } from 'electron'
import { getOverlayWindow } from './overlay'
import { getAppWindow } from './app-window'

/** Send a fire-and-forget event to both primary windows. Mirrors the
 *  plugin-hotkeys-changed notify pattern but targets overlay + app window.
 *  Skips destroyed windows (refs persist after teardown) and an optional
 *  sender so the originating window doesn't redundantly re-fetch. */
export function broadcastToWindows(channel: string, except?: WebContents | null): void {
  for (const win of [getOverlayWindow(), getAppWindow()]) {
    if (!win || win.isDestroyed()) continue
    if (except && win.webContents === except) continue
    win.webContents.send(channel)
  }
}
