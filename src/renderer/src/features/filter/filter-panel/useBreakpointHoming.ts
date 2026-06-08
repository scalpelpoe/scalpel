import { useEffect } from 'react'

/**
 * Home a breakpoint slider to the segment matching the item's current value.
 *
 * Re-homes whenever `value` changes - a fresh copy of the same base at a
 * different stack size / quality / strand count must move the selection to the
 * segment that now applies. A manual slider drag changes the selection (not
 * `value`), so it survives. `active` mirrors the panel's "show this slider"
 * gate (more than one breakpoint); the effect is inert until it's true.
 */
export function useBreakpointHoming(
  active: boolean | undefined,
  breakpoints: ReadonlyArray<{ min: number; max: number }> | undefined,
  value: number,
  onSelect: (index: number) => void,
): void {
  // Deliberately depend only on [active, value]: including breakpoints/onSelect
  // would re-fire on unrelated renders and clobber a manually dragged segment.
  useEffect(() => {
    if (!active || !breakpoints) return
    const idx = breakpoints.findIndex((bp) => value >= bp.min && value <= bp.max)
    onSelect(idx >= 0 ? idx : 0)
  }, [active, value])
}
