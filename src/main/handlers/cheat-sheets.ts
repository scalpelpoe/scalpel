import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { PREFAB_PACKS } from '../../shared/data/cheat-sheet-prefabs'
import { CHEAT_SHEET_PREFAB_BASE_URL } from '../../shared/endpoints'
import {
  fetchImageBuffer,
  generateCategoryId,
  generateSheetId,
  getCheatSheetsOverlay,
  hidePreview,
  minimizeCheatSheets,
  removeCategoryDir,
  removeSheetFile,
  restoreCheatSheets,
  saveSheetBuffer,
  showPreview,
} from '../cheat-sheets'
import { getOverlayWindow, showOverlay } from '../overlay'
import { setPinnedZoneContentHeight, setPinnedZoneRendererVisible } from '../pinned-zone'
import { aroundNativeDialog } from '../windowing'

const ALLOWED_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

export function register(): void {
  ipcMain.handle(
    'cheat-sheet:add-from-file',
    async (_event, categoryId: string): Promise<Array<{ id: string; ext: string }>> => {
      // Wrap so the file picker doesn't trip the Scalpel-blur handlers and
      // hide the overlay the user opened it from.
      const result = await aroundNativeDialog(() =>
        dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Images', extensions: [...ALLOWED_EXTS] }],
        }),
      )
      if (result.canceled) return []
      const added: Array<{ id: string; ext: string }> = []
      for (const filePath of result.filePaths) {
        const raw = extname(filePath).slice(1).toLowerCase()
        const ext = raw === 'jpeg' ? 'jpg' : raw
        if (!ALLOWED_EXTS.has(ext)) continue
        const buffer = readFileSync(filePath)
        const id = generateSheetId()
        saveSheetBuffer(categoryId, id, ext, buffer)
        added.push({ id, ext })
      }
      return added
    },
  )

  ipcMain.handle(
    'cheat-sheet:add-from-url',
    async (_event, categoryId: string, url: string): Promise<{ id: string; ext: string }> => {
      const { buffer, ext } = await fetchImageBuffer(url)
      const id = generateSheetId()
      saveSheetBuffer(categoryId, id, ext, buffer)
      return { id, ext }
    },
  )

  /** Download every image in a starter pack and persist them under a fresh
   *  category id. The renderer creates the category in settings using the
   *  returned (id, ext) list - this matches the existing add-from-file
   *  contract so the same renderer plumbing handles both. */
  ipcMain.handle(
    'cheat-sheet:import-prefab',
    async (
      _event,
      slug: string,
    ): Promise<{ categoryId: string; sheets: Array<{ id: string; ext: string; areaCodes?: string[] }> }> => {
      const pack = PREFAB_PACKS.find((p) => p.slug === slug)
      if (!pack) throw new Error(`Unknown prefab pack: ${slug}`)
      const categoryId = generateCategoryId()
      const sheets: Array<{ id: string; ext: string; areaCodes?: string[] }> = []
      for (const img of pack.images) {
        const { buffer, ext } = await fetchImageBuffer(CHEAT_SHEET_PREFAB_BASE_URL + img.path)
        const id = generateSheetId()
        saveSheetBuffer(categoryId, id, ext, buffer)
        sheets.push({ id, ext, areaCodes: img.areaCodes.length > 0 ? img.areaCodes : undefined })
      }
      return { categoryId, sheets }
    },
  )

  ipcMain.handle(
    'cheat-sheet:list-prefabs',
    (): Array<{ slug: string; name: string; imageCount: number; poeVersion?: 1 | 2 }> => {
      return PREFAB_PACKS.map((p) => ({
        slug: p.slug,
        name: p.name,
        imageCount: p.images.length,
        poeVersion: p.poeVersion,
      }))
    },
  )

  ipcMain.handle('cheat-sheet:remove', (_event, categoryId: string, sheetId: string, ext: string): void => {
    removeSheetFile(categoryId, sheetId, ext)
  })

  ipcMain.handle('cheat-sheet:remove-category', (_event, categoryId: string): void => {
    removeCategoryDir(categoryId)
  })

  ipcMain.on('cheat-sheet:close', () => getCheatSheetsOverlay()?.hide())

  ipcMain.on('cheat-sheet:minimize', () => minimizeCheatSheets())
  ipcMain.on('cheat-sheet:restore', () => restoreCheatSheets())

  ipcMain.on('open-settings-tab', (_e, tab: string) => {
    const overlay = getOverlayWindow()
    if (!overlay || overlay.isDestroyed()) return
    // Use showOverlay (not overlay.show()) so overlayVisible flips true and
    // the uIOhook mouse-tracking starts hit-testing panel rects - otherwise
    // the overlay shows but stays click-through. Send the tab IPC together
    // with open-view so App.tsx can route it before SettingsPanel mounts
    // (the panel's own focus-settings-tab listener wouldn't be registered
    // yet on first open).
    showOverlay()
    overlay.webContents.send('open-view', 'setup', tab)
  })

  ipcMain.on('cheat-sheet-preview:show', (_e, src: string) => showPreview(src))

  ipcMain.on('cheat-sheet-preview:hide', () => hidePreview())

  ipcMain.on('pinned-zone:set-visible', (_e, visible: boolean) => {
    setPinnedZoneRendererVisible(visible)
  })

  ipcMain.on('pinned-zone:set-content-height', (_e, height: number) => {
    setPinnedZoneContentHeight(height)
  })
}
