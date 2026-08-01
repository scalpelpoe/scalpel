import { ipcMain } from 'electron'
import { type CursorPoint, getGameCursorPosition } from '../screen-capture/cursor'

export function registerPluginCursorHandlers(): void {
  ipcMain.handle('plugins:get-cursor-position', (): CursorPoint | null => getGameCursorPosition())
}
