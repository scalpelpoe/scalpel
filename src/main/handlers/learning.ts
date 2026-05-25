import { ipcMain } from 'electron'
import { recordSession, resetLearning } from '../learning'

export function register(): void {
  ipcMain.on('record-pref-observation', (_e, sessionId: unknown, chips: unknown) => {
    if (typeof sessionId !== 'number' || !Array.isArray(chips)) return
    recordSession(sessionId, chips as Array<{ id: string; type: string; enabled: boolean }>)
  })

  ipcMain.handle('reset-learning', (_e, scope: unknown) => {
    if (scope === 'all') {
      resetLearning('all')
      return
    }
    if (
      typeof scope === 'object' &&
      scope !== null &&
      typeof (scope as { rarity?: unknown }).rarity === 'string' &&
      typeof (scope as { itemClass?: unknown }).itemClass === 'string'
    ) {
      resetLearning(scope as { rarity: string; itemClass: string })
    }
  })
}
