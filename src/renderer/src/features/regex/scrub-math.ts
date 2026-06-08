/** Advance a scrub accumulator by a horizontal delta. Speed scales with the
 *  current magnitude so small values scrub finely and large values scrub fast.
 *  Returns the new (un-clamped, un-snapped) accumulator; callers clamp + snap.
 *
 *  Pixels-per-displayed-step works out to 3/speed regardless of step size, so the
 *  0.5 floor moves 6px per step everywhere. Two corrections sit on top of that:
 *
 *  - `tiny`: a small integer stat like "+to all skills" spans only 2-3 whole steps,
 *    so 6px/step covers its entire range in ~12px. Drop integer-step scrubs below
 *    magnitude 5 to 20px/step so those land precisely. Gated on an integer step so
 *    decimals are untouched, and capped at magnitude 5 so large-range integer stats
 *    (resistances, %increased) only pay the slowdown for their first few units.
 *  - decimal boost: a 2-decimal stat (APS, crit%) spans hundreds of 0.01 steps, so
 *    at 6px/step a whole unit costs ~600px. Multiply decimal-step speed 4x so
 *    dragging across a meaningful decimal range stays brisk (~1.5px/step). */
export function scrubAccumulate(accumulator: number, dx: number, step: number): number {
  const magnitude = Math.abs(accumulator)
  const tiny = step >= 1 && magnitude < 5
  const base = magnitude >= 1000 ? 5 : magnitude >= 100 ? 2 : magnitude >= 10 ? 1 : tiny ? 0.15 : 0.5
  const speed = step < 1 ? base * 4 : base
  return accumulator + (dx * speed * step) / 3
}

/** Round a scrubbed value to the nearest `step`, then to `decimals` precision,
 *  so floating-point scrub math doesn't emit 1.4500000001-style junk. */
export function snapToStep(value: number, step: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(Math.round(value / step) * step * factor) / factor
}

/** Midpoint of a "min-max" placeholder range (e.g. "20-40" -> 30, "1-1.5" -> 1.25),
 *  or null when the placeholder is not a plain numeric range. Used to seed an empty
 *  field at the middle of its range when the user starts scrubbing it. */
export function placeholderRangeMidpoint(placeholder: string): number | null {
  const m = placeholder.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/)
  if (!m) return null
  const mid = (parseFloat(m[1]) + parseFloat(m[2])) / 2
  return Number.isNaN(mid) ? null : mid
}
