import { useEffect } from 'react'

/** Input types that take typed text. Everything else (range, checkbox, radio,
 *  color, button...) is operated by mouse; a focused settings slider must not
 *  suspend every global hotkey. */
const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
])

/** Push "the user is typing in this window" to the main process, so the hotkey
 *  gate can swallow keystrokes while the user is typing in any Scalpel surface
 *  (main overlay, whiteboard text editor, etc.). Without this, single-key
 *  hotkeys would be unusable in text fields.
 *
 *  Typing requires the window itself to hold OS focus. Clicking the game blurs
 *  the window but leaves document.activeElement on the field (focusout fires
 *  with activeElement unchanged), and the overlay then unmounts its view while
 *  unfocused, which fires nothing. Reading activeElement alone left main's
 *  suspension stuck - every global hotkey dead, including the one that reopens
 *  the overlay - until relaunch.
 *
 *  Mount in each Scalpel window's root component. Main reconciles per-sender
 *  state in `src/main/overlay.ts` and gates uIOhook-routed handlers via
 *  `isTypingInOverlay()`. */
export function useReportInputFocus(): void {
  useEffect(() => {
    const isEditable = (el: Element | null): boolean => {
      if (!el) return false
      if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type)
      if (el.tagName === 'TEXTAREA') return true
      return (el as HTMLElement).isContentEditable === true
    }
    let last = false
    const update = (): void => {
      const next = document.hasFocus() && isEditable(document.activeElement)
      if (next !== last) {
        last = next
        window.api.setOverlayInputFocused(next)
      }
    }
    update()
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    window.addEventListener('blur', update)
    window.addEventListener('focus', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
      window.removeEventListener('blur', update)
      window.removeEventListener('focus', update)
    }
  }, [])
}
