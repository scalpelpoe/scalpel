import { PHYSICAL_PREFIX, decodePhysicalToken, encodePhysicalKey, isPhysicalCode } from '@shared/hotkey-tokens'

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
  return display.replace(/CommandOrControl/g, 'Ctrl')
}
