import type { ModLine, SnapshotItem } from '@scalpel/stream-contract'
import type { TierDataset } from '@shared/data/tiers/types'
import type { NinjaItemData, NinjaModEntry } from './sources/ninja-types'

/** Tier badges for poe.ninja items. poe.ninja gives each mod's id and rolled stat
 *  values but not its tier, so we look the roll up in Scalpel's tier dataset:
 *
 *  - Only NAMED ladder entries count as tiers. Unnamed entries in a group are
 *    essence / corruption / implicit variants that the game doesn't number, and
 *    counting them would shift every tier. Named ascending position also lines up
 *    with the numeric suffix of GGG's mod ids (FireResist7 is the 7th named fire
 *    resistance tier), which breaks ties between groups sharing a stat.
 *  - Prefix vs suffix comes from PoE's naming convention: suffix names start with
 *    "of" ("of Magma"), prefix names don't ("Hoarder's").
 *
 *  Anything ambiguous or unmatched gets no badge rather than a wrong one. */

export interface ModTierMatch {
  num: number
  label: string
  affix: 'prefix' | 'suffix'
  /** Roll range of the matched tier; single-stat mods only. */
  range?: { min: number; max: number }
}

type CompactMod = TierDataset['mods'][number]

/** RePoE stores per-10,000 stats raw; the game shows them as percentages. */
function displayDivisor(statId: string): number {
  return statId.endsWith('_permyriad') ? 100 : 1
}

const trailingDigits = /(\d+)$/

function modFamily(id: string): { family: string; index: number | null } {
  const m = trailingDigits.exec(id)
  return m ? { family: id.slice(0, -m[1].length), index: Number(m[1]) } : { family: id, index: null }
}

function sameStatIds(mod: CompactMod, statIds: string[]): boolean {
  if (mod.s.length !== statIds.length) return false
  const ids = new Set(statIds)
  return mod.s.every(([id]) => ids.has(id))
}

function rollFits(mod: CompactMod, stats: Record<string, number>): boolean {
  return mod.s.every(([id, lo, hi]) => {
    const v = stats[id]
    return typeof v === 'number' && v >= Math.min(lo, hi) && v <= Math.max(lo, hi)
  })
}

/** Resolve one poe.ninja mod against the base's affix pool. */
export function resolveModTier(data: TierDataset, baseType: string, mod: NinjaModEntry): ModTierMatch | null {
  const poolIdx = data.bases[baseType]
  const pool = poolIdx == null ? undefined : data.pools[poolIdx]
  if (!pool) return null
  const statIds = Object.keys(mod.stats)
  if (statIds.length === 0) return null
  const { family, index } = modFamily(mod.id)

  let best: { score: number; match: ModTierMatch } | null = null
  let tied = false
  for (const [group, ladder] of Object.entries(pool)) {
    const named = ladder.map((i) => data.mods[i]).filter((m) => m.n)
    const position = named.findIndex((m) => sameStatIds(m, statIds) && rollFits(m, mod.stats))
    if (position === -1) continue

    const tier = named[position]
    let score = 0
    if (group === family) score += 4
    else if (group.startsWith(family) || family.startsWith(group)) score += 2
    if (index !== null && index === position + 1) score += 1

    const num = named.length - position
    const affix = tier.n.startsWith('of ') ? 'suffix' : 'prefix'
    const match: ModTierMatch = { num, affix, label: `${affix === 'prefix' ? 'P' : 'S'}${num}` }
    if (tier.s.length === 1) {
      const [id, lo, hi] = tier.s[0]
      const d = displayDivisor(id)
      match.range = { min: Math.min(lo, hi) / d, max: Math.max(lo, hi) / d }
    }

    if (!best || score > best.score) {
      best = { score, match }
      tied = false
    } else if (score === best.score) {
      tied = true
    }
  }
  return best && !tied ? best.match : null
}

const NUMBER = /\d+(?:\.\d+)?/g

function lineNumbers(text: string): number[] {
  return (text.match(NUMBER) ?? []).map(Number)
}

function displayedValues(mod: NinjaModEntry): number[] {
  return Object.entries(mod.stats).map(([id, v]) => Math.abs(v) / displayDivisor(id))
}

/** Every number printed on the line must come from the mod's own rolls. */
function explains(mod: NinjaModEntry, numbers: number[]): boolean {
  const values = displayedValues(mod)
  return numbers.length > 0 && numbers.every((n) => values.some((v) => Math.abs(v - n) < 1e-6))
}

const GENERIC_TOKENS = new Set(['base', 'local', 'damage', 'maximum', 'minimum', 'added', 'attack', 'item', 'found'])

/** Break ties between mods with the same numbers by how many stat-id words the line mentions. */
function keywordScore(mod: NinjaModEntry, text: string): number {
  const words = text.toLowerCase()
  const tokens = new Set(
    Object.keys(mod.stats)
      .flatMap((id) => id.toLowerCase().split(/[^a-z]+/))
      .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t)),
  )
  let score = 0
  for (const t of tokens) if (words.includes(t)) score++
  return score
}

function pickMod(candidates: NinjaModEntry[], text: string): NinjaModEntry | null {
  if (candidates.length <= 1) return candidates[0] ?? null
  const scored = candidates.map((m) => ({ m, s: keywordScore(m, text) })).sort((a, b) => b.s - a.s)
  return scored[0].s > scored[1].s ? scored[0].m : null
}

/** poe.ninja mod categories that feed each tiered section. */
const SECTION_CATEGORIES: Record<string, string[]> = {
  explicit: ['explicit', 'fractured', 'crafted', 'mutated'],
  desecrated: ['desecrated'],
}

function tagLine(line: ModLine, candidates: NinjaModEntry[], data: TierDataset, baseType: string): void {
  const mod = pickMod(
    candidates.filter((m) => explains(m, lineNumbers(line.text))),
    line.text,
  )
  if (!mod) return
  const tier = resolveModTier(data, baseType, mod)
  if (!tier) return
  line.tier = { affix: tier.affix, num: tier.num, label: tier.label }
  if (tier.range) line.range = tier.range
}

/** Add tier badges to an item's explicit and desecrated lines, in place. Uniques
 *  are skipped: their mods aren't affixes and have no tiers. */
export function applyTiers(item: SnapshotItem, raw: NinjaItemData, data: TierDataset): void {
  if (item.rarity === 'unique' || !raw.mods) return
  for (const section of item.sections) {
    const categories = SECTION_CATEGORIES[section.kind]
    if (!categories) continue
    const candidates = categories.flatMap((c) => raw.mods?.[c] ?? [])
    if (candidates.length === 0) continue
    for (const line of section.lines) tagLine(line, candidates, data, item.baseType)
  }
}
