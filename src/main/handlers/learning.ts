import { ipcMain } from 'electron'
import { recordSession, resetLearning, setPreference, unsetPreference } from '../learning'

export function register(): void {
  ipcMain.on('record-pref-observation', (_e, sessionId: unknown, chips: unknown) => {
    if (typeof sessionId !== 'number' || !Array.isArray(chips)) return
    recordSession(sessionId, chips as Array<{ id: string; type: string; enabled: boolean }>)
  })

  ipcMain.on('set-learned-preference', (_e, sessionId: unknown, chipId: unknown, enabled: unknown) => {
    if (typeof sessionId !== 'number' || typeof chipId !== 'string' || typeof enabled !== 'boolean') return
    setPreference(sessionId, chipId, enabled)
  })

  ipcMain.on('unset-learned-preference', (_e, sessionId: unknown, chipId: unknown) => {
    if (typeof sessionId !== 'number' || typeof chipId !== 'string') return
    unsetPreference(sessionId, chipId)
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
