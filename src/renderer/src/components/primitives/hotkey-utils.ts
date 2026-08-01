import {
  NUMPAD_CODE_TO_TOKEN,
  NUMPAD_TOKEN_LABELS,
  PHYSICAL_PREFIX,
  decodePhysicalToken,
  encodePhysicalKey,
  isPhysicalCode,
} from '@shared/hotkey-tokens'

export function keyEventToAccelerator(e: KeyboardEvent): string | null {
  const KEY_MAP: Record<string, string> = {
    Control: '',
    Meta: '',
    Alt: '',
    Shift: '',
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Escape',
    Enter: 'Return',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    Insert: 'Insert',
  }
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(keyPart(e, KEY_MAP))
  return parts.join('+')
}

function keyPart(e: KeyboardEvent, namedKeys: Record<string, string>): string {
  const named = namedKeys[e.key]
  if (named != null) return named
  // With NumLock off, numpad keys emit named e.key values (ArrowDown, Home, Delete,
  // etc.) and must keep recording as those - that IS what the key does in that
  // state - so this check must stay after the named lookup above. With NumLock on,
  // e.key is a single char ("2", ".", "+") not in the named map, so it falls
  // through here and records by code instead.
  const numpad = NUMPAD_CODE_TO_TOKEN[e.code as keyof typeof NUMPAD_CODE_TO_TOKEN]
  if (numpad != null) return numpad
  // OEM/punctuation/international keys carry different glyphs across layouts, so
  // bind them by physical position (KeyboardEvent.code) while keeping the typed
  // glyph for display. Letters and digits stay in their plain Electron form so
  // common QWERTY hotkeys remain globalShortcut-bindable. See shared/hotkey-tokens.ts.
  if (isPhysicalCode(e.code)) {
    const glyph = e.key.length === 1 ? e.key.toUpperCase() : e.code
    return encodePhysicalKey(e.code, glyph)
  }
  return e.key.length === 1 ? e.key.toUpperCase() : e.key
}

export function prettyHotkey(accelerator: string | undefined | null): string {
  if (!accelerator) return ''
  // The physical token is always the final segment, so decode it from the prefix
  // onward rather than splitting on '+' (a glyph can itself be '+').
  let display = accelerator
  const idx = accelerator.indexOf(PHYSICAL_PREFIX)
  if (idx !== -1) {
    const decoded = decodePhysicalToken(accelerator.slice(idx))
    if (decoded) display = accelerator.slice(0, idx) + decoded.glyph
  }
  // The numpad token, when present, is always the final segment and contains no
  // '+', so swap it for its display label without disturbing the rest.
  const lastPlus = display.lastIndexOf('+')
  const lastSegment = lastPlus === -1 ? display : display.slice(lastPlus + 1)
  const numpadLabel = NUMPAD_TOKEN_LABELS[lastSegment]
  if (numpadLabel != null) {
    display = lastPlus === -1 ? numpadLabel : display.slice(0, lastPlus + 1) + numpadLabel
  }
  return display.replace(/CommandOrControl/g, 'Ctrl')
}
