import { useEffect, type RefObject } from 'react'

/** Document-level pointerdown + Escape handler that fires `onDismiss` when the
 *  user clicks outside `ref` or presses Escape. The popovers, dialogs, and
 *  context menu in the whiteboard all use the same pattern - a single hook
 *  keeps the listener wiring (capture-phase add + matching cleanup) in one
 *  place so divergence stays out of the bug surface. */
export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  /** When false, the hook is inert. Used to gate on an "is open" flag. */
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return
    function onDocPointerDown(e: PointerEvent): void {
      const el = ref.current
      if (!el) return
      if (!(e.target instanceof Element)) return
      if (el.contains(e.target)) return
      // If the click target is the trigger that opened this popover, skip
      // dismissing so the trigger's own click handler can toggle cleanly.
      // Without this, the dismiss + the trigger's click would batch into one
      // re-open, defeating any toggle behavior.
      if (e.target.closest('[data-dismiss-anchor]')) return
      onDismiss()
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
      }
    }
    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [enabled, onDismiss, ref])
}
