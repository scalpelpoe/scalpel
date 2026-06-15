import { UiohookKey } from 'uiohook-napi'
import { PHYSICAL_PREFIX, PHYSICAL_CODES, decodePhysicalToken } from '@shared/hotkey-tokens'

// ─── Accelerator → uiohook keycode mapping ────────────────────────────────────
//
// Pure (no Electron), so it can be unit-tested directly. hotkeys.ts owns the
// stateful registration; this module owns the string<->keycode translation.

const LETTER_KEYS: Record<string, number> = Object.fromEntries(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [c, UiohookKey[c as keyof typeof UiohookKey]]),
)

const EXTRA_KEYS: Record<string, number> = {
  F1: UiohookKey.F1,
  F2: UiohookKey.F2,
  F3: UiohookKey.F3,
  F4: UiohookKey.F4,
  F5: UiohookKey.F5,
  F6: UiohookKey.F6,
  F7: UiohookKey.F7,
  F8: UiohookKey.F8,
  F9: UiohookKey.F9,
  F10: UiohookKey.F10,
  F11: UiohookKey.F11,
  F12: UiohookKey.F12,
  Space: UiohookKey.Space,
  Tab: UiohookKey.Tab,
  Escape: UiohookKey.Escape,
  Delete: UiohookKey.Delete,
  Home: UiohookKey.Home,
  End: UiohookKey.End,
  PageUp: UiohookKey.PageUp,
  PageDown: UiohookKey.PageDown,
  '0': UiohookKey['0'],
  '1': UiohookKey['1'],
  '2': UiohookKey['2'],
  '3': UiohookKey['3'],
  '4': UiohookKey['4'],
  '5': UiohookKey['5'],
  '6': UiohookKey['6'],
  '7': UiohookKey['7'],
  '8': UiohookKey['8'],
  '9': UiohookKey['9'],
}

const KEY_MAP: Record<string, number> = { ...LETTER_KEYS, ...EXTRA_KEYS }

// DOM code name -> uiohook keycode for the physically-routed OEM/punctuation
// keys. The code names match UiohookKey's property names exactly, so this is a
// direct lookup keyed off the shared PHYSICAL_CODES list.
const CODE_TO_UIOHOOK: Record<string, number> = Object.fromEntries(
  PHYSICAL_CODES.map((code) => [code, UiohookKey[code as keyof typeof UiohookKey]]),
)

export interface KeyCombo {
  keycode: number
  ctrl: boolean
  shift: boolean
  alt: boolean
}

const MODIFIER_PREFIX = /^(CommandOrControl|Control|Ctrl|Command|Shift|Alt|Option)\+/

/**
 * Parse an accelerator string into a uiohook combo, or null if the key part is
 * unknown. Modifiers are stripped one prefix at a time so the remaining key
 * segment can safely contain a '+' (e.g. a physical token whose glyph is '+').
 */
export function parseAccelerator(accelerator: string): KeyCombo | null {
  let ctrl = false
  let shift = false
  let alt = false
  let rest = accelerator.replace(/\s+/g, '')

  let match = rest.match(MODIFIER_PREFIX)
  while (match) {
    const mod = match[1]
    if (mod === 'Shift') shift = true
    else if (mod === 'Alt' || mod === 'Option') alt = true
    else ctrl = true
    rest = rest.slice(match[0].length)
    match = rest.match(MODIFIER_PREFIX)
  }

  let keycode = 0
  const physical = decodePhysicalToken(rest)
  if (physical) keycode = CODE_TO_UIOHOOK[physical.code] ?? 0
  else if (KEY_MAP[rest]) keycode = KEY_MAP[rest]

  return keycode ? { keycode, ctrl, shift, alt } : null
}

/**
 * True when Electron's globalShortcut can bind this accelerator. Physical tokens
 * (international / OEM keys) cannot be registered with globalShortcut at all, so
 * those rely solely on the uiohook keydown matcher.
 */
export function isElectronRegisterable(accelerator: string): boolean {
  return !accelerator.includes(PHYSICAL_PREFIX)
}
