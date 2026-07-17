// Layout-robust hotkey key tokens.
//
// Electron accelerators and uiohook both fall down on non-US keys: a Danish "æ"
// records as the character "Æ", which Electron's globalShortcut cannot bind and
// which has no fixed uiohook keycode (uiohook matches by physical position, and
// layouts disagree on where a glyph lives - Danish puts æ on the Semicolon
// position, Norwegian puts ø there). The only stable identity is the physical
// position (DOM KeyboardEvent.code), which maps 1:1 onto uiohook's key names.
//
// So for OEM/punctuation/international keys we store a composite token carrying
// BOTH the physical code (for matching, in the main process) and the glyph the
// user typed (for display, in the renderer): `Phys:<Code>:<glyph>`. Letters and
// digits keep their plain form so the common QWERTY hotkeys stay Electron-bindable.
//
// Shared across processes so the encode (renderer) and decode (main) sides cannot
// drift on the token format.

export const PHYSICAL_PREFIX = 'Phys:'

// DOM KeyboardEvent.code values we route by physical position. Every name here
// is also a UiohookKey property name, so the main process resolves the keycode
// with a direct lookup. These are the OEM/punctuation keys that carry different
// glyphs across layouts (Danish æ/ø/å, German ö/ä/ü, US ; ' [ ] etc.).
export const PHYSICAL_CODES = [
  'Semicolon',
  'Quote',
  'Comma',
  'Period',
  'Slash',
  'Backquote',
  'BracketLeft',
  'BracketRight',
  'Backslash',
  'Minus',
  'Equal',
] as const

export type PhysicalCode = (typeof PHYSICAL_CODES)[number]

const PHYSICAL_CODE_SET: ReadonlySet<string> = new Set(PHYSICAL_CODES)

export function isPhysicalCode(code: string): code is PhysicalCode {
  return PHYSICAL_CODE_SET.has(code)
}

/** Build the composite key segment for a physically-routed key. */
export function encodePhysicalKey(code: PhysicalCode, glyph: string): string {
  return `${PHYSICAL_PREFIX}${code}:${glyph}`
}

export function isPhysicalToken(segment: string): boolean {
  return segment.startsWith(PHYSICAL_PREFIX)
}

/**
 * Decode a `Phys:<Code>:<glyph>` key segment. The glyph may itself contain ':'
 * or '+', so the code is the run up to the first ':' after the prefix and the
 * glyph is everything after it. Returns null for non-physical segments.
 */
export function decodePhysicalToken(segment: string): { code: string; glyph: string } | null {
  if (!isPhysicalToken(segment)) return null
  const rest = segment.slice(PHYSICAL_PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon === -1) return null
  return { code: rest.slice(0, colon), glyph: rest.slice(colon + 1) }
}

// Numpad keys. Unlike the physically-routed OEM keys above, Electron CAN bind
// these natively (num0-num9, numdec, numadd, numsub, nummult, numdiv), so they
// stay Electron-registerable plain tokens. DOM code names match UiohookKey
// property names exactly, so the main process derives uiohook keycodes by
// inverting this map.
export const NUMPAD_CODE_TO_TOKEN = {
  Numpad0: 'num0',
  Numpad1: 'num1',
  Numpad2: 'num2',
  Numpad3: 'num3',
  Numpad4: 'num4',
  Numpad5: 'num5',
  Numpad6: 'num6',
  Numpad7: 'num7',
  Numpad8: 'num8',
  Numpad9: 'num9',
  NumpadDecimal: 'numdec',
  NumpadAdd: 'numadd',
  NumpadSubtract: 'numsub',
  NumpadMultiply: 'nummult',
  NumpadDivide: 'numdiv',
} as const

// Display labels for the settings UI ("num2" reads poorly in a hotkey chip).
export const NUMPAD_TOKEN_LABELS: Record<string, string> = {
  num0: 'Num 0',
  num1: 'Num 1',
  num2: 'Num 2',
  num3: 'Num 3',
  num4: 'Num 4',
  num5: 'Num 5',
  num6: 'Num 6',
  num7: 'Num 7',
  num8: 'Num 8',
  num9: 'Num 9',
  numdec: 'Num .',
  numadd: 'Num +',
  numsub: 'Num -',
  nummult: 'Num *',
  numdiv: 'Num /',
}
