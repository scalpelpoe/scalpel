import type { LauncherCategory } from './launcher-categories'

/** How slice contents are shown in the Scalpel radial launcher. */

export type LauncherSliceMode = 'names' | 'icons' | 'both'

export const LAUNCHER_SLICE_MODES: ReadonlyArray<LauncherSliceMode> = ['names', 'icons', 'both']

export function isLauncherSliceMode(value: unknown): value is LauncherSliceMode {
  return value === 'names' || value === 'icons' || value === 'both'
}

export type LauncherStyle = 'classic' | 'hub' | 'reticle' | 'minimal' | 'grouped' | 'twotier'

export const LAUNCHER_STYLES: ReadonlyArray<LauncherStyle> = [
  'classic',

  'hub',

  'reticle',

  'minimal',

  'grouped',

  'twotier',
]

export function isLauncherStyle(value: unknown): value is LauncherStyle {
  return (
    value === 'classic' ||
    value === 'hub' ||
    value === 'reticle' ||
    value === 'minimal' ||
    value === 'grouped' ||
    value === 'twotier'
  )
}

/** Coerce stored settings; legacy `fan` maps to hub. */

export function normalizeLauncherStyle(value: unknown): LauncherStyle {
  if (value === 'fan') return 'hub'

  return isLauncherStyle(value) ? value : 'classic'
}

/** One selectable slice in the Scalpel radial launcher. */

export interface LauncherItem {
  action: string

  label: string

  /** Inline SVG markup (or data URL) for icon modes. Optional when unavailable. */

  icon?: string

  category?: LauncherCategory
}

/** Payload pushed to the launcher overlay when it opens / refreshes. */

export interface LauncherPayload {
  items: LauncherItem[]

  sliceMode: LauncherSliceMode

  style: LauncherStyle
}

/** Built-in actions surfaced in the radial launcher (subset of app macros). */

export const LAUNCHER_BUILTIN_ITEMS: ReadonlyArray<{
  action: string
  label: string
  scope?: 'poe1' | 'poe2' | 'both'
}> = [
  { action: 'openSettings', label: 'Settings' },

  { action: 'toggleWhiteboard', label: 'Whiteboard' },

  { action: 'toggleRegexRemote', label: 'Regex Remote' },

  { action: 'toggleCheatSheets', label: 'Cheat Sheets' },

  { action: 'openRegex', label: 'Regex Tool' },

  { action: 'openAudit', label: 'Audit' },

  { action: 'openDust', label: 'Dust', scope: 'poe1' },

  { action: 'openDivCards', label: 'Div Cards', scope: 'poe1' },
]
