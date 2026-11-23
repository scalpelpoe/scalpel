import { Key } from '@scalpel/platform'
import { NUMPAD_CODE_TO_TOKEN, PHYSICAL_PREFIX, PHYSICAL_CODES, decodePhysicalToken } from '@shared/hotkey-tokens'

// ─── Accelerator → uiohook keycode mapping ────────────────────────────────────
//
// Pure (no Electron), so it can be unit-tested directly. hotkeys.ts owns the
// stateful registration; this module owns the string<->keycode translation.

const LETTER_KEYS: Record<string, number> = Object.fromEntries(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [c, Key[c as keyof typeof Key]]),
)

const EXTRA_KEYS: Record<string, number> = {
  F1: Key.F1,
  F2: Key.F2,
  F3: Key.F3,
  F4: Key.F4,
  F5: Key.F5,
  F6: Key.F6,
  F7: Key.F7,
  F8: Key.F8,
  F9: Key.F9,
  F10: Key.F10,
  F11: Key.F11,
  F12: Key.F12,
  Space: Key.Space,
  Tab: Key.Tab,
  Escape: Key.Escape,
  Delete: Key.Delete,
  Home: Key.Home,
  End: Key.End,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,
  '0': Key['0'],
  '1': Key['1'],
  '2': Key['2'],
  '3': Key['3'],
  '4': Key['4'],
  '5': Key['5'],
  '6': Key['6'],
  '7': Key['7'],
  '8': Key['8'],
  '9': Key['9'],
}

// Electron's native num0-num9/numdec/numadd/numsub/nummult/numdiv tokens, mapped
// to uiohook keycodes by inverting the shared code->token map. DOM code names
// match Key property names, so this is a direct lookup.
const NUMPAD_KEYS: Record<string, number> = Object.fromEntries(
  Object.entries(NUMPAD_CODE_TO_TOKEN).map(([code, token]) => [token, Key[code as keyof typeof Key]]),
)

const KEY_MAP: Record<string, number> = { ...LETTER_KEYS, ...EXTRA_KEYS, ...NUMPAD_KEYS }

// DOM code name -> uiohook keycode for the physically-routed OEM/punctuation
// keys. The code names match Key's property names exactly, so this is a
// direct lookup keyed off the shared PHYSICAL_CODES list.
const CODE_TO_UIOHOOK: Record<string, number> = Object.fromEntries(
  PHYSICAL_CODES.map((code) => [code, Key[code as keyof typeof Key]]),
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
