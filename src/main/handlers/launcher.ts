import { ipcMain } from 'electron'
import { buildLauncherPayload, hideLauncher, runLauncherAction } from '../launcher'

export function register(): void {
  ipcMain.handle('launcher:list', () => buildLauncherPayload())
  ipcMain.on('launcher:run', (_evt, action: unknown) => {
    if (typeof action !== 'string' || action.length === 0) return
    runLauncherAction(action)
  })
  ipcMain.on('launcher:close', () => hideLauncher())
}
