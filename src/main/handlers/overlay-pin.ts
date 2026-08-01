import { ipcMain } from 'electron'
import { getOverlayPinnedForWebContents, setOverlayPinnedForWebContents } from '../windowing'

/** Sender-resolved pin state for secondary overlays: the renderer never needs
 *  to know its own overlay id - main matches event.sender to the window. */
export function register(): void {
  ipcMain.handle('secondary-overlay:get-pinned', (event) => getOverlayPinnedForWebContents(event.sender.id))
  ipcMain.on('secondary-overlay:set-pinned', (event, pinned: unknown) => {
    setOverlayPinnedForWebContents(event.sender.id, pinned === true)
  })
}
