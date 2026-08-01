/** State model for the PoE1 Beasts tab (poe.re "Bestiary" page port): type,
 *  defaults, sanitizer, and equality.
 *
 *  Lives in shared (not the renderer feature folder) because it doubles as the
 *  `beast` payload on a saved RegexPreset, which crosses the IPC boundary. Same
 *  arrangement as items-state.ts. */

export interface BeastState {
  /** Lower bound on a beast's chaos value for the auto-pack. null = unset.
   *  Numbers rather than upstream's raw input strings; we parse at the
   *  ScrubInput boundary instead of coercing at use. */
  minChaos: number | null
  /** Upper bound on a beast's chaos value for the auto-pack. null = unset. */
  maxChaos: number | null
  /** Let harvest beasts into the auto-pack. */
  includeHarvest: boolean
  /** true = the menagerie's 100-character search budget, false = 250. */
  menagerieLimit: boolean
  /** Restrict the auto-pack to red (craftable) beasts. */
  redOnly: boolean
  /** Beast names always emitted, ahead of the auto-pack, bypassing every filter. */
  pinned: string[]
  /** Beast names never emitted. */
  muted: string[]
}

export const DEFAULT_BEAST_STATE: BeastState = {
  minChaos: null,
  maxChaos: null,
  includeHarvest: false,
  menagerieLimit: false,
  redOnly: false,
  pinned: [],
  muted: [],
}

/** Finite, non-negative numbers only. Anything else reads as "unset" so a junk
 *  persisted bound can never silently empty the output. */
function cleanBound(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return value
}

function cleanNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) continue
    seen.add(entry)
  }
  return [...seen]
}

/** Coerce an untrusted persisted value into a valid BeastState. Field-by-field
 *  merge over defaults: unknown fields drop, missing ones heal, junk resets.
 *  Required by the usePersistedJSON house rule -- the version-namespaced key can
 *  be read after an in-process game switch, and an unsanitized foreign shape
 *  crashed the Vendor tab before (412804f6, b5045ba8). */
export function sanitizeBeastState(value: unknown): BeastState {
  const s = structuredClone(DEFAULT_BEAST_STATE)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return s
  const raw = value as Record<string, unknown>

  s.minChaos = cleanBound(raw.minChaos)
  s.maxChaos = cleanBound(raw.maxChaos)
  if (typeof raw.includeHarvest === 'boolean') s.includeHarvest = raw.includeHarvest
  if (typeof raw.menagerieLimit === 'boolean') s.menagerieLimit = raw.menagerieLimit
  if (typeof raw.redOnly === 'boolean') s.redOnly = raw.redOnly

  s.pinned = cleanNames(raw.pinned)
  // A pin is a stronger statement than a mute, so an entry in both resolves to
  // pinned. Without this the engine's pin pass and mute pass would disagree.
  const pinnedSet = new Set(s.pinned)
  s.muted = cleanNames(raw.muted).filter((n) => !pinnedSet.has(n))

  return s
}

function sameNameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((n) => set.has(n))
}

/** Structural equality, order-insensitive for the name lists. Used by the
 *  generator's matchesPreset so save-as-update dedups on the real selection
 *  rather than on rendered tag text. */
export function beastStateEquals(a: BeastState, b: BeastState): boolean {
  return (
    a.minChaos === b.minChaos &&
    a.maxChaos === b.maxChaos &&
    a.includeHarvest === b.includeHarvest &&
    a.menagerieLimit === b.menagerieLimit &&
    a.redOnly === b.redOnly &&
    sameNameSet(a.pinned, b.pinned) &&
    sameNameSet(a.muted, b.muted)
  )
}
