export { keyEventToAccelerator, prettyHotkey } from '../../../components/primitives/hotkey-utils'

export const APP_MACRO_DEFS = [
  { id: 'openSettings', label: 'Open Settings' },
  { id: 'openAudit', label: 'Open Audit' },
  { id: 'openDust', label: 'Open Dust Explorer' },
  { id: 'openDivCards', label: 'Open Div Card Explorer' },
  { id: 'openRegex', label: 'Open Regex Tool' },
  { id: 'openWiki', label: 'Open Wiki' },
  { id: 'openPoeDb', label: 'Open PoEDB' },
  { id: 'pasteRegex', label: 'Paste Current Regex' },
  { id: 'useSavedRegex', label: 'Use Saved Regex' },
  { id: 'closeOverlay', label: 'Close Overlay' },
  { id: 'toggleWhiteboard', label: 'Toggle Whiteboard' },
  { id: 'toggleRegexRemote', label: 'Toggle Regex Remote' },
] as const

export function generateClientCategoryId(): string {
  return `cat-${Math.random().toString(36).slice(2, 10)}`
}
