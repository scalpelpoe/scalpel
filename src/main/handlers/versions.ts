import { ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, PoeItem } from '../../shared/types'
import { evaluateAndSend } from '../evaluation'
import { getCurrentFilter, loadFilter } from '../filter-state'
import { clearHistory, getHistory, undoLast } from '../history'
import { reloadFilterInGame } from '../overlay'
import { getProfileBackedSetting } from '../profiles/profile-settings'
import { deleteVersion, listVersions, restoreVersion, saveVersion } from '../update/versions'

export function register(store: Store<AppSettings>): void {
  ipcMain.handle('get-history', () => getHistory())

  ipcMain.handle('list-versions', () => {
    const filterPath = getProfileBackedSetting(store, 'filterPath')
    if (!filterPath) return []
    return listVersions(filterPath)
  })

  ipcMain.handle('create-checkpoint', (_event, label?: string) => {
    const filterPath = getProfileBackedSetting(store, 'filterPath')
    if (!filterPath) return { ok: false, error: 'No filter path set' }
    const version = saveVersion(filterPath, true, label)
    return version ? { ok: true } : { ok: false, error: 'Failed to save checkpoint' }
  })

  ipcMain.handle('restore-version', (_event, versionFilename: string, itemJson?: string) => {
    const filterPath = getProfileBackedSetting(store, 'filterPath')
    if (!filterPath) return { ok: false, error: 'No filter path set' }
    // Save current state as auto-version before restoring
    saveVersion(filterPath, false)
    const result = restoreVersion(filterPath, versionFilename)
    if (result.ok) {
      loadFilter(filterPath)
      const currentFilter = getCurrentFilter()
      if (currentFilter && itemJson) {
        const item: PoeItem = JSON.parse(itemJson)
        evaluateAndSend(item)
      }
      reloadFilterInGame()
      clearHistory()
    }
    return result
  })

  ipcMain.handle('delete-version', (_event, versionFilename: string) => {
    return deleteVersion(versionFilename)
  })

  ipcMain.handle('undo-edit', (_event, itemJson?: string) => {
    const filterPath = getProfileBackedSetting(store, 'filterPath')
    if (!filterPath) return { ok: false, error: 'No filter path set' }
    const result = undoLast(filterPath)
    if (result.ok) {
      loadFilter(filterPath)
      const currentFilter = getCurrentFilter()
      if (currentFilter && itemJson) {
        const item: PoeItem = JSON.parse(itemJson)
        evaluateAndSend(item)
      }
      reloadFilterInGame()
    }
    return result
  })
}
