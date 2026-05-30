import type { WebContents } from 'electron'
import { getOverlayWindow } from './overlay'
import { getAppWindow } from './app-window'
import { getSecondaryOverlayWindows } from './windowing'

/** Send a fire-and-forget event to the primary windows (overlay + app) and
 *  every live secondary-overlay window. Skips destroyed windows (refs persist
 *  after teardown) and an optional sender so the originating window doesn't
 *  redundantly re-fetch. Channels not listened to by a given window are
 *  harmless no-ops. */
export function broadcastToWindows(channel: string, except?: WebContents | null): void {
  for (const win of [getOverlayWindow(), getAppWindow(), ...getSecondaryOverlayWindows()]) {
    if (!win || win.isDestroyed()) continue
    if (except && win.webContents === except) continue
    win.webContents.send(channel)
  }
}
