/** Type declarations for the CJS build script, consumed by the co-located Vitest test. */

export interface DefenceBoundsEntry {
  ar?: [number, number]
  ev?: [number, number]
  es?: [number, number]
  ward?: [number, number]
}

export declare function buildBounds(baseItems: Record<string, unknown>): Record<string, DefenceBoundsEntry>
