/** Type declarations for the CJS build script, consumed by the co-located Vitest test. */

export interface CompactMod {
  n: string
  l: number
  g: string
  s: Array<[string, number, number]>
  t: string
  /** Generation-type affix; stream file only. */
  a?: 'p' | 's'
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
  opts?: { domains?: string[]; withAffix?: boolean },
): CompactDataset

export interface StreamCompactDataset extends CompactDataset {
  families: Record<string, number[]>
}

export declare function buildStreamTiers(
  modsByBase: Record<string, unknown>,
  mods: Record<string, unknown>,
  baseItems: Record<string, unknown>,
): StreamCompactDataset

export declare function stripMarkup(text: string): string

export declare function normKey(text: string): string

export declare function buildDesecrated(mods: Record<string, unknown>): DesecratedDataset

export interface ModSourceDataset {
  schemaVersion: number
  /** Item classes that host at least one source family; the lookup is scoped to these. */
  classes: string[]
  sources: Record<string, string>
}

export declare function buildModSources(
  modsByBase: Record<string, unknown>,
  mods: Record<string, unknown>,
): ModSourceDataset

export declare function familyToSource(family: string): string | null

export declare function sha256(str: string): string

export declare function main(): Promise<void>

export declare const SCHEMA_VERSION: number
export declare const OUT_DIR: string
export declare const SOURCES: Record<string, string>
