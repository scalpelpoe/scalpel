import { screen } from 'electron'

import { OverlayController } from 'electron-overlay-window'

import {
  LAUNCHER_BUILTIN_ITEMS,
  type LauncherItem,
  type LauncherPayload,
  type LauncherSliceMode,
  type LauncherStyle,
  isLauncherSliceMode,
  normalizeLauncherStyle,
} from '@shared/launcher'

import { launcherCategoryForItem } from '@shared/launcher-categories'

import { LAUNCHER_BUILTIN_ICONS, LAUNCHER_FALLBACK_ICON } from '@shared/launcher-icons'

import { appMacroScope, scopeAppliesTo } from '@shared/macro-scope'

import { getPoeVersion } from './game-state'

import { getInstalledPlugins } from './plugins/manager'

import { getRegisteredOverlayHotkeys } from './plugins/hotkey-registry'

import { getRegisteredPluginTabs } from './plugins/tab-registry'

import { registerSecondaryOverlay, type SecondaryOverlay } from './windowing'

const LAUNCHER_SIZE = 400

type AppMacroDispatch = (action: string, tag?: string, presetId?: string) => void

let overlay: SecondaryOverlay | null = null

let dispatch: AppMacroDispatch | null = null

let getSliceMode: (() => LauncherSliceMode) | null = null

let getStyle: (() => LauncherStyle) | null = null

let pendingShow = false

export function initLauncher(deps: {
  dispatch: AppMacroDispatch

  getSliceMode: () => LauncherSliceMode

  getStyle: () => LauncherStyle
}): void {
  dispatch = deps.dispatch

  getSliceMode = deps.getSliceMode

  getStyle = deps.getStyle
}

export function registerLauncherOverlay(): SecondaryOverlay {
  if (overlay) return overlay

  overlay = registerSecondaryOverlay({
    id: 'scalpel-launcher',

    htmlEntry: 'launcher.html',

    defaultAnchor: () => ({ fracX: 0.4, fracY: 0.35, fracW: 0.2, fracH: 0.36 }),

    onFirstShow: (win) => {
      if (pendingShow) {
        pendingShow = false

        positionAtCursor()

        win.webContents.send('launcher:items', buildLauncherPayload())
      }
    },
  })

  return overlay
}

export function getLauncherOverlay(): SecondaryOverlay | null {
  return overlay
}

function resolveSliceMode(): LauncherSliceMode {
  const mode = getSliceMode?.()

  return isLauncherSliceMode(mode) ? mode : 'names'
}

function resolveStyle(): LauncherStyle {
  return normalizeLauncherStyle(getStyle?.())
}

export function buildLauncherItems(): LauncherItem[] {
  const game = getPoeVersion()

  const items: LauncherItem[] = []

  for (const entry of LAUNCHER_BUILTIN_ITEMS) {
    const scope = entry.scope ?? appMacroScope(entry.action)

    if (!scopeAppliesTo(scope, game)) continue

    items.push({
      action: entry.action,

      label: entry.label,

      icon: LAUNCHER_BUILTIN_ICONS[entry.action] ?? LAUNCHER_FALLBACK_ICON,

      category: launcherCategoryForItem(entry.action, entry.label),
    })
  }

  const names = new Map(getInstalledPlugins().map((p) => [p.manifest.id, p.manifest.name]))

  const tabs = getRegisteredPluginTabs()

  for (const [pluginId, { label }] of getRegisteredOverlayHotkeys()) {
    const name = names.get(pluginId) ?? pluginId

    const suffix = label?.trim() ? ` — ${label}` : ''

    items.push({
      action: `plugin-overlay:${pluginId}`,

      label: `${name}${suffix}`,

      icon: tabs.get(pluginId)?.icon || LAUNCHER_FALLBACK_ICON,

      category: launcherCategoryForItem(`plugin-overlay:${pluginId}`, `${name}${suffix}`),
    })
  }

  return items
}

export function buildLauncherPayload(): LauncherPayload {
  return {
    items: buildLauncherItems(),

    sliceMode: resolveSliceMode(),

    style: resolveStyle(),
  }
}

function positionAtCursor(): void {
  if (!overlay) return

  const win = overlay.getWindow()

  if (!win || win.isDestroyed()) return

  const cursor = screen.getCursorScreenPoint()

  const display = screen.getDisplayNearestPoint(cursor)

  const area = display.workArea

  const x = Math.round(Math.max(area.x, Math.min(cursor.x - LAUNCHER_SIZE / 2, area.x + area.width - LAUNCHER_SIZE)))

  const y = Math.round(Math.max(area.y, Math.min(cursor.y - LAUNCHER_SIZE / 2, area.y + area.height - LAUNCHER_SIZE)))

  overlay.setBoundsProgrammaticOnce({ x, y, width: LAUNCHER_SIZE, height: LAUNCHER_SIZE })
}

/** Show the radial launcher centered on the current cursor. No-op when PoE is not focused. */

export function showLauncherAtCursor(): void {
  if (!overlay) return

  if (!OverlayController.targetHasFocus) return

  positionAtCursor()

  const win = overlay.getWindow()

  if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
    overlay.send('launcher:items', buildLauncherPayload())

    overlay.show()

    win.focus()

    return
  }

  pendingShow = true

  overlay.show()
}

export function hideLauncher(): void {
  overlay?.hide()

  pendingShow = false
}

export function toggleLauncherAtCursor(): void {
  if (overlay?.isVisible()) hideLauncher()
  else showLauncherAtCursor()
}

export function runLauncherAction(action: string): void {
  hideLauncher()

  dispatch?.(action)
}
