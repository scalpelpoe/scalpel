import { ipcMain } from 'electron'
import { recordSession, resetLearning } from '../learning'

export function register(): void {
  ipcMain.on(
    'record-pref-observation',
    (_e, sessionId: number, chips: Array<{ id: string; type: string; enabled: boolean }>) => {
      recordSession(sessionId, chips)
    },
  )
  ipcMain.handle('reset-learning', (_e, scope: 'all' | { rarity: string; itemClass: string }) => {
    resetLearning(scope)
  })
}
