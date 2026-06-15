import { app, Tray, Menu, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type Store from 'electron-store'
import type { AppSettings, GameVariant } from '@shared/types'
import { m } from '@shared/paraglide/messages.js'
import { PROFILE_VERSION_KEY } from '../profiles/profile-settings'
import { requestGameSwitch } from '../game-switch'
import { createAndOpenBugReport, recordMainDiagnostic } from '../diagnostics'

function resolveAppIconPath(iconExt: 'icon.ico' | 'icon.png'): string | null {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, iconExt)]
    : [
        join(app.getAppPath(), 'resources', iconExt),
        join(process.cwd(), 'resources', iconExt),
        join(__dirname, '../../resources', iconExt),
      ]

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function getAppIcon(): Electron.NativeImage {
  const iconExt = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const iconPath = resolveAppIconPath(iconExt)
  if (!iconPath) {
    recordMainDiagnostic('tray-icon', new Error(`Unable to resolve tray icon ${iconExt}`))
    return nativeImage.createEmpty()
  }
  return nativeImage.createFromPath(iconPath)
}

export interface TrayDeps {
  store: Store<AppSettings>
  showAppWindow: () => void
}

export interface TrayHandle {
  refreshMenu(): void
}

let tray: Tray | null = null
let currentDeps: TrayDeps | null = null

function buildMenu(): Menu {
  if (!currentDeps) return new Menu()
  const { store, showAppWindow } = currentDeps
  const current = store.get(PROFILE_VERSION_KEY) === 2 ? 2 : 1
  const other: GameVariant = current === 1 ? 2 : 1

  return Menu.buildFromTemplate([
    { label: m.tray_current_game({ game: current }), enabled: false },
    {
      label: m.tray_switch_game({ game: other }),
      click: () => requestGameSwitch(store, other),
    },
    { type: 'separator' },
    {
      label: m.tray_settings(),
      click: () => showAppWindow(),
    },
    {
      label: m.tray_report_bug(),
      click: () => {
        createAndOpenBugReport().catch((err) => recordMainDiagnostic('bug-report', err))
      },
    },
    { type: 'separator' },
    { label: m.tray_quit(), click: () => app.quit() },
  ])
}

export function refreshTrayMenu(): void {
  tray?.setContextMenu(buildMenu())
}

export function createTray(deps: TrayDeps): void {
  currentDeps = deps

  const icon = getAppIcon()
  tray = new Tray(icon)
  tray.setToolTip('Scalpel')
  tray.setContextMenu(buildMenu())

  tray.on('click', () => deps.showAppWindow())
}
