/** Type declarations for the CJS build script, consumed by the co-located Vitest test. */

export interface CompactMod {
  n: string
  l: number
  g: string
  s: Array<[string, number, number]>
  t: string
}

export interface CompactDataset {
  schemaVersion: number
  mods: CompactMod[]
  pools: Array<Record<string, number[]>>
  bases: Record<string, number>
}

export interface DesecratedTier {
  min: number
  max: number
  lvl: number
}

export interface DesecratedMod {
  key: string
  tiers: DesecratedTier[]
}

export interface DesecratedDataset {
  schemaVersion: number
  mods: DesecratedMod[]
}

export declare function buildCompact(
  modsByBase: Record<string, unknown>,
  mods: Record<string, unknown>,
  baseItems: Record<string, unknown>,
): CompactDataset

export declare function stripMarkup(text: string): string

export declare function normKey(text: string): string

export declare function buildDesecrated(mods: Record<string, unknown>): DesecratedDataset

export declare function sha256(str: string): string

export declare function main(): Promise<void>

export declare const SCHEMA_VERSION: number
export declare const OUT_DIR: string
export declare const SOURCES: Record<string, string>
