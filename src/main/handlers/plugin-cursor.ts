import { ipcMain } from 'electron'
import { desktop } from '../desktop'
import { type CursorPoint, getGameCursorPosition } from '../screen-capture/cursor'

export function registerPluginCursorHandlers(): void {
  ipcMain.handle('plugins:get-cursor-position', async (): Promise<CursorPoint | null> => {
    await desktop.refreshCursor()
    return getGameCursorPosition()
  })
}
