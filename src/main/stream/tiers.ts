import type { ModLine, SnapshotItem } from '@scalpel/stream-contract'
import type { StreamTierDataset, TierDataset } from '@shared/data/tiers/types'
import { stripTradeTokens } from '@shared/game-text'
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
 *  Anything ambiguous or unmatched gets no badge rather than a wrong one.
 *
 *  The optional StreamTierDataset (stream-tiers-poe2.json) covers what the
 *  price-check dataset leaves out: flask/charm pools, rune-influence ladders keyed
 *  by id family, and abyss mods. */

export interface ModTierMatch {
  num: number
  label: string
  affix: 'prefix' | 'suffix'
  /** Roll range of the matched tier; single-stat mods only. */
  range?: { min: number; max: number }
}

type CompactMod = StreamTierDataset['mods'][number]

/** RePoE stores some stats in finer units than the game prints: per-10,000 stats
 *  and local crit chance show as percentages, per-minute rates as per second. */
function displayDivisor(statId: string): number {
  if (statId.endsWith('_permyriad') || statId === 'local_critical_strike_chance') return 100
  if (statId.endsWith('_per_minute')) return 60
  return 1
}

const trailingDigits = /(\d+)$/

/** Id family and tier index. Trailing underscores (FlaskExtraCharges2__) are
 *  disambiguation noise, not part of either. */
function modFamily(id: string): { family: string; index: number | null } {
  const trimmed = id.replace(/_+$/, '')
  const m = trailingDigits.exec(trimmed)
  return m ? { family: trimmed.slice(0, -m[1].length), index: Number(m[1]) } : { family: trimmed, index: null }
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

/** Generation-type affix when the data has it, else PoE's naming convention. */
function affixOf(tier: CompactMod): 'prefix' | 'suffix' {
  if (tier.a) return tier.a === 'p' ? 'prefix' : 'suffix'
  return tier.n.startsWith('of ') ? 'suffix' : 'prefix'
}

function toMatch(tier: CompactMod, num: number, withRange = true): ModTierMatch {
  const affix = affixOf(tier)
  const match: ModTierMatch = { num, affix, label: `${affix === 'prefix' ? 'P' : 'S'}${num}` }
  if (withRange && tier.s.length === 1) {
    const [id, lo, hi] = tier.s[0]
    const d = displayDivisor(id)
    match.range = { min: Math.min(lo, hi) / d, max: Math.max(lo, hi) / d }
  }
  return match
}

/** Abyss lord mods always show "(Tier: 1)": one entry per type, lord and slot. */
const ABYSS_ID = /^AbyssMod/

function resolveAbyss(mod: NinjaModEntry, stream: StreamTierDataset | null | undefined): ModTierMatch | null {
  const statIds = Object.keys(mod.stats)
  const entries = stream?.families[mod.id]?.map((i) => stream.mods[i]) ?? []
  // The data's generation type wins whenever the family exists; the id token is
  // only a fallback (some radius-jewel ids say Prefix for a suffix mod).
  const exact = entries.find((m) => sameStatIds(m, statIds))
  const entry = exact ?? entries[0]
  if (entry?.a) return toMatch(entry, 1, !!exact && rollFits(exact, mod.stats))
  const token = /(Prefix|Suffix)/.exec(mod.id)?.[1]
  if (!token) return null
  return token === 'Prefix' ? { num: 1, affix: 'prefix', label: 'P1' } : { num: 1, affix: 'suffix', label: 'S1' }
}

/** A family ladder (rune influences): the roll's named position, counted from the
 *  top. Rungs can overlap (TimeInfluenceDodgeRoll [3,4] and [4,5]); a roll fitting
 *  several takes the rung its id index names, and with no such rung gets nothing. */
function resolveInLadder(mods: CompactMod[], ladder: number[], mod: NinjaModEntry): ModTierMatch | null {
  const statIds = Object.keys(mod.stats)
  const named = ladder.map((i) => mods[i]).filter((m) => m.n)
  const fits = named.flatMap((m, i) => (sameStatIds(m, statIds) && rollFits(m, mod.stats) ? [i] : []))
  let position: number | undefined = fits[0]
  if (fits.length > 1) {
    const { index } = modFamily(mod.id)
    position = fits.find((i) => index === i + 1)
  }
  return position === undefined ? null : toMatch(named[position], named.length - position)
}

/** Resolve one poe.ninja mod: abyss rule, then the stream families (an influence
 *  never falls back to the ordinary group its type collides with), then the base's
 *  pool in the price-check dataset, then in the stream dataset (flasks, charms). */
export function resolveModTier(
  data: TierDataset,
  baseType: string,
  mod: NinjaModEntry,
  stream?: StreamTierDataset | null,
): ModTierMatch | null {
  if (Object.keys(mod.stats).length === 0) return null
  if (ABYSS_ID.test(mod.id)) return resolveAbyss(mod, stream)
  if (!stream) return resolveInPool(data, baseType, mod)
  const ladder = stream.families[modFamily(mod.id).family]
  if (ladder) return resolveInLadder(stream.mods, ladder, mod)
  return resolveInPool(data, baseType, mod) ?? resolveInPool(stream, baseType, mod)
}

/** Resolve one poe.ninja mod against the base's affix pool. */
function resolveInPool(
  data: Pick<StreamTierDataset, 'bases' | 'pools'> & { mods: CompactMod[] },
  baseType: string,
  mod: NinjaModEntry,
): ModTierMatch | null {
  const poolIdx = data.bases[baseType]
  const pool = poolIdx == null ? undefined : data.pools[poolIdx]
  if (!pool) return null
  const statIds = Object.keys(mod.stats)
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

    const match = toMatch(tier, named.length - position)

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

function lineNumbers(text: string): string[] {
  return text.match(NUMBER) ?? []
}

/** Values a stat can print as: the roll itself and, with catalyst quality, the
 *  scaled roll. Both floor and round are accepted because the game's rounding of
 *  quality-scaled mod values is unverified; tagLine tries unscaled values first so
 *  the extra slack can't steal a line an exact roll already explains. */
function shownValues(raw: number, statId: string, quality: number): number[] {
  const v = Math.abs(raw) / displayDivisor(statId)
  if (quality <= 0) return [v]
  const scaled = v * (1 + quality / 100)
  return [v, Math.floor(scaled), Math.round(scaled)]
}

/** Printed numbers are rounded to the precision they show ("33.3" for 33.33). */
function printedAs(printed: string, v: number): boolean {
  const decimals = printed.split('.')[1]?.length ?? 0
  return Math.abs(v - Number(printed)) < 1e-6 || (decimals > 0 && v.toFixed(decimals) === printed)
}

/** Every number printed on the line must come from the given per-stat values. */
function explainedBy(values: number[][], numbers: string[]): boolean {
  return numbers.length > 0 && numbers.every((n) => values.some((vs) => vs.some((v) => printedAs(n, v))))
}

function explains(mod: NinjaModEntry, numbers: string[], quality: number): boolean {
  return explainedBy(
    Object.entries(mod.stats).map(([id, v]) => shownValues(v, id, quality)),
    numbers,
  )
}

/** Two mods with a common stat print as one summed line (a crafted Alloy or
 *  Essence mod stacking onto an explicit one). Quality scales each mod, so the
 *  sum of the scaled values is a candidate alongside the scaled sum. */
function explainsPair(a: NinjaModEntry, b: NinjaModEntry, numbers: string[], quality: number): boolean {
  const shared = Object.keys(a.stats).filter((id) => id in b.stats)
  if (shared.length === 0) return false
  const ids = new Set([...Object.keys(a.stats), ...Object.keys(b.stats)])
  const values = [...ids].map((id) => {
    if (!shared.includes(id)) return shownValues(a.stats[id] ?? b.stats[id], id, quality)
    const sums = shownValues(a.stats[id] + b.stats[id], id, quality)
    for (const x of shownValues(a.stats[id], id, quality))
      for (const y of shownValues(b.stats[id], id, quality)) sums.push(x + y)
    return sums
  })
  return explainedBy(values, numbers)
}

/** Catalyst quality ("Quality (Lightning Modifiers): +20%") scales the displayed
 *  rolls of matching mods. Plain "Quality" scales base defences, not mods. */
function catalystQuality(raw: NinjaItemData): number {
  for (const p of raw.properties) {
    if (!/^Quality \(.+ Modifiers\)$/.test(stripTradeTokens(p.name).trim())) continue
    const n = Number.parseInt(String(p.values[0]?.[0] ?? '').replace(/[^\d]/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return 0
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

/** poe.ninja mod categories behind the explicit block. Desecrated lines live in
 *  the same block (see normalize.ts) but match only desecrated mods. */
const EXPLICIT_CATEGORIES = ['explicit', 'fractured', 'crafted', 'mutated']
const DESECRATED_CATEGORIES = ['desecrated']

/** Crafted additions with no affix tier of their own. Matched by id prefix, not by
 *  poe.ninja's category: its `crafted` list also holds ordinary tiered affixes
 *  (Flanged Mace's LocalIncreasedAttackSpeed7), so the category can't tell them apart. */
const CRAFTED_ID = /^(Alloy|Essence)/

function badge(line: ModLine, tier: ModTierMatch, withRange: boolean): void {
  line.tier = { affix: tier.affix, num: tier.num, label: tier.label }
  if (withRange && tier.range) line.range = tier.range
}

function tagLine(
  line: ModLine,
  candidates: NinjaModEntry[],
  data: TierDataset,
  stream: StreamTierDataset | null,
  baseType: string,
  quality: number,
): void {
  const numbers = lineNumbers(line.text)
  // Exact rolls first: a catalyst-scaled value can collide with another mod's raw roll.
  let single = candidates.filter((m) => explains(m, numbers, 0))
  if (single.length === 0 && quality > 0) single = candidates.filter((m) => explains(m, numbers, quality))
  if (single.length > 0) {
    const mod = pickMod(single, line.text)
    const tier = mod && resolveModTier(data, baseType, mod, stream)
    if (tier) badge(line, tier, true)
    return
  }
  const pairs: [NinjaModEntry, NinjaModEntry][] = []
  for (let i = 0; i < candidates.length; i++)
    for (let j = i + 1; j < candidates.length; j++)
      if (explainsPair(candidates[i], candidates[j], numbers, quality)) pairs.push([candidates[i], candidates[j]])
  if (pairs.length !== 1) return
  const affixMods = pairs[0].filter((m) => !CRAFTED_ID.test(m.id))
  if (affixMods.length !== 1) return
  const tier = resolveModTier(data, baseType, affixMods[0], stream)
  // The line shows a sum, not a roll in the tier, so it gets no range.
  if (tier) badge(line, tier, false)
}

/** Add tier badges to an item's explicit lines (desecrated ones included), in
 *  place. Uniques are skipped: their mods aren't affixes and have no tiers.
 *
 *  Desecrated lines are recognised by their `desecrated` flag, set by
 *  normalize.ts's buildSections; an unflagged line is matched against explicit mods. */
export function applyTiers(
  item: SnapshotItem,
  raw: NinjaItemData,
  data: TierDataset,
  stream: StreamTierDataset | null = null,
): void {
  if (item.rarity === 'unique' || !raw.mods) return
  const pool = (categories: string[]) => categories.flatMap((c) => raw.mods?.[c] ?? [])
  const explicit = pool(EXPLICIT_CATEGORIES)
  const desecrated = pool(DESECRATED_CATEGORIES)
  const quality = catalystQuality(raw)
  for (const section of item.sections) {
    if (section.kind !== 'explicit') continue
    for (const line of section.lines) {
      const candidates = line.desecrated ? desecrated : explicit
      if (candidates.length > 0) tagLine(line, candidates, data, stream, item.baseType, quality)
    }
  }
}
