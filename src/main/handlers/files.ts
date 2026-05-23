import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, FilterListEntry } from '../../shared/types'
import { getAppWindow } from '../app-window'
import { updateOnlineSyncDir } from '../online-sync'
import { setCloseOnClickOutside, showOverlay } from '../overlay'
import { applySetting } from '../settings-write'

export function register(store: Store<AppSettings>): void {
  const defaultFilterFolderForActiveGame = (): string => {
    const suffix = store.get('poeVersion') === 2 ? ' 2' : ''
    return `${process.env.USERPROFILE}\\Documents\\My Games\\Path of Exile${suffix}`
  }

  ipcMain.handle('pick-filter-file', async (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    const isOverlay = sender && sender !== getAppWindow()

    const dialogOpts = {
      title: 'Select your .filter file',
      defaultPath: defaultFilterFolderForActiveGame(),
      filters: [{ name: 'PoE Filter', extensions: ['filter'] }],
      properties: ['openFile'] as 'openFile'[],
    }

    // Suppress close-on-click-outside while the dialog is open so it doesn't
    // kill the overlay when the dialog steals focus from PoE
    if (isOverlay) setCloseOnClickOutside(false)

    // Don't parent to overlay window - it can't host dialogs. Use app window or standalone.
    const parent = !isOverlay && sender ? sender : undefined
    const result = parent ? await dialog.showOpenDialog(parent, dialogOpts) : await dialog.showOpenDialog(dialogOpts)

    // Restore close-on-click-outside setting
    if (isOverlay) setCloseOnClickOutside(store.get('closeOnClickOutside'))

    if (result.canceled || result.filePaths.length === 0) {
      if (isOverlay) showOverlay()
      return null
    }

    const path = result.filePaths[0]
    applySetting(store, 'filterPath', path, event.sender)

    if (isOverlay) showOverlay()
    return path
  })

  ipcMain.handle('pick-filter-dir', async (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender)
    const isOverlay = sender && sender !== getAppWindow()
    if (isOverlay) setCloseOnClickOutside(false)

    const parent = !isOverlay && sender ? sender : undefined
    const dialogOpts = {
      title: 'Select your Path of Exile filter folder',
      defaultPath: defaultFilterFolderForActiveGame(),
      properties: ['openDirectory'] as 'openDirectory'[],
    }
    const result = parent ? await dialog.showOpenDialog(parent, dialogOpts) : await dialog.showOpenDialog(dialogOpts)

    if (isOverlay) setCloseOnClickOutside(store.get('closeOnClickOutside'))

    if (result.canceled || result.filePaths.length === 0) {
      if (isOverlay) showOverlay()
      return null
    }

    // Users sometimes pick the "OnlineFilters" subfolder instead of the Path of Exile
    // folder that contains it. Walk back up so we scan the parent regardless.
    let dir = result.filePaths[0]
    if (basename(dir).toLowerCase() === 'onlinefilters') dir = dirname(dir)
    applySetting(store, 'filterDir', dir, event.sender)
    updateOnlineSyncDir(dir)
    if (isOverlay) showOverlay()
    return dir
  })

  ipcMain.handle('scan-filter-dir', (_event, dir: string): FilterListEntry[] => {
    if (!dir || !existsSync(dir)) return []
    const entries: FilterListEntry[] = []

    // Scan top-level .filter files
    try {
      for (const f of readdirSync(dir)) {
        if (f.toLowerCase().endsWith('.filter')) {
          entries.push({
            path: join(dir, f),
            name: basename(f, '.filter'),
            online: false,
          })
        }
      }
    } catch {
      /* ignore read errors */
    }

    // Scan OnlineFilters subfolder - files have no extension and random names.
    // The real filter name is in the header: "#name:Filter Name"
    const onlineDirName = readdirSync(dir).find((f) => f.toLowerCase() === 'onlinefilters')
    const onlinePath = onlineDirName ? join(dir, onlineDirName) : null
    if (onlinePath && existsSync(onlinePath)) {
      try {
        for (const f of readdirSync(onlinePath)) {
          const fullPath = join(onlinePath, f)
          // Skip directories and .filter files (those are local filters)
          try {
            const stat = statSync(fullPath)
            if (stat.isDirectory()) continue
          } catch {
            continue
          }
          let name = f
          try {
            const content = readFileSync(fullPath, 'utf-8')
            for (const line of content.split('\n').slice(0, 15)) {
              const match = line.match(/^#name:(.+)/)
              if (match) {
                name = match[1].trim()
                break
              }
            }
          } catch {
            /* ignore read errors */
          }
          entries.push({ path: fullPath, name, online: true })
        }
      } catch {
        /* ignore read errors */
      }
    }

    return entries
  })

  ipcMain.handle('scan-sound-files', (_event, dir: string): string[] => {
    if (!dir || !existsSync(dir)) return []
    const soundExts = new Set(['.mp3', '.wav', '.ogg'])
    const files: string[] = []
    try {
      for (const f of readdirSync(dir)) {
        const ext = f.slice(f.lastIndexOf('.')).toLowerCase()
        if (soundExts.has(ext)) files.push(f)
      }
      // Also scan sounds/ subfolder
      const soundsDir = join(dir, 'sounds')
      if (existsSync(soundsDir)) {
        for (const f of readdirSync(soundsDir)) {
          const ext = f.slice(f.lastIndexOf('.')).toLowerCase()
          if (soundExts.has(ext)) files.push(`sounds/${f}`)
        }
      }
    } catch {
      /* ignore */
    }
    return files.sort()
  })

  ipcMain.handle('get-sound-data-url', (_event, dir: string, filename: string): string | null => {
    try {
      const fullPath = join(dir, filename)
      if (!existsSync(fullPath)) return null
      const data = readFileSync(fullPath)
      const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
      const mime = ext === 'ogg' ? 'audio/ogg' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
      return `data:${mime};base64,${data.toString('base64')}`
    } catch {
      return null
    }
  })
}
