import { LIMITS } from '@scalpel/stream-contract'

/** Cut a string to the contract's per-field limit so a long line can't fail the whole snapshot. */
export function clip(s: string, max: number = LIMITS.string): string {
  return s.length > max ? s.slice(0, max) : s
}
