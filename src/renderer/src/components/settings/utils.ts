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
  const key = KEY_MAP[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
  parts.push(key)
  return parts.join('+')
}

/** Format an accelerator string for display (CommandOrControl -> Ctrl on Windows). */
export function prettyHotkey(accelerator: string | undefined | null): string {
  if (!accelerator) return ''
  return accelerator.replace(/CommandOrControl/g, 'Ctrl')
}

export const APP_MACRO_DEFS = [
  { id: 'openSettings', label: 'Open Settings' },
  { id: 'openAudit', label: 'Open Audit' },
  { id: 'openDust', label: 'Open Dust Explorer' },
  { id: 'openDivCards', label: 'Open Div Card Explorer' },
  { id: 'openRegex', label: 'Open Regex Tool' },
  { id: 'pasteRegex', label: 'Paste Current Regex' },
  { id: 'useSavedRegex', label: 'Use Saved Regex' },
  { id: 'closeOverlay', label: 'Close Overlay' },
] as const
