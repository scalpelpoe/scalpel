import type { WaystoneMod } from '@shared/data/regex/waystone-mods'
import { generateBoundedValueRegex, generateNumberRegex } from './waystone-number-regex'
import { generateRarityRegex, type RaritySettings } from './rarity-regex'

export interface WaystoneTier {
  min: number
  max: number
}

export interface WaystoneCorruption {
  corrupted: boolean
  uncorrupted: boolean
}

export interface WaystoneRevives {
  min: number
  max: number
}

export interface WaystoneQualifiers {
  delirious: boolean
  anyPack: boolean
}

/** "Quantity & yield" numeric thresholds (poe2.re's waystone quantifiers). Each is a
 *  minimum % the waystone must roll; 0 / null means "no constraint". They generate a
 *  `"<token>.*<numberRegex>%"` part and (in the trade path) a map_filter min. */
export interface WaystoneQuantities {
  /** Monster Pack Size (trade: map_packsize). */
  packSize: number | null
  /** Monster Effectiveness (regex only -- no trade filter exists). */
  monsterEffectiveness: number | null
  /** Monster Rarity (regex only -- no trade filter exists). */
  monsterRarity: number | null
  /** Item Rarity / IIR (trade: map_iir). */
  itemRarity: number | null
  /** Waystone Drop Chance (trade: map_bonus). */
  dropChance: number | null
}

/** Short regex token (a unique substring of each waystone property line) paired with the
 *  quantity field that drives it, producing `"<token>.*<numberRegex>%"`. Tokens are
 *  case-insensitive fragments chosen to match only their property line:
 *    "ack siz" -> P[ack Siz]e, "ffectiv" -> E[ffectiv]eness, "er rar" -> Monst[er Rar]ity,
 *    "m rar" -> Ite[m Rar]ity, "p c" -> Dro[p C]hance. */
export const WAYSTONE_QUANTIFIER_TOKENS: Array<[keyof WaystoneQuantities, string]> = [
  ['packSize', 'ack siz.*'],
  ['monsterEffectiveness', 'ffectiv.*'],
  ['monsterRarity', 'er rar.*'],
  ['itemRarity', 'm rar.*'],
  ['dropChance', 'p c.*'],
]

export interface WaystoneSelections {
  /** Mod ids the user wants to MATCH (will appear in the positive/good regex group).
   *  Any mod regardless of affix can be placed here. */
  want: Set<number>
  /** Mod ids the user wants to AVOID (will appear in the negated "!..." group).
   *  Any mod regardless of affix can be placed here. */
  avoid: Set<number>
  /** "any" = match if any selected mod is present; "all" = require all. */
  wantMode: 'any' | 'all'
  /** Per-mod magnitude thresholds for want mods, keyed by mod id. A selected
   *  mod with a non-zero value gets a number-regex prefix; absent/falsy means the bare
   *  mod token. */
  wantValues: Record<number, number>
  /** Same as wantValues, for avoid mods. */
  avoidValues: Record<number, number>
}

interface BuildArgs {
  mods: WaystoneMod[]
  tier: WaystoneTier
  corruption: WaystoneCorruption
  rarity: RaritySettings
  revives: WaystoneRevives
  qualifiers: WaystoneQualifiers
  quantities: WaystoneQuantities
  selections: WaystoneSelections
  /** "Round down to nearest 10" -- compresses magnitude regex. */
  round10: boolean
  /** "Match numbers over 100%" -- widens magnitude regex to allow 3-digit rolls. */
  over100: boolean
  customText?: string
}

/** Build the full PoE2 waystone regex string. Mirrors poe2.re's `generateWaystoneRegex`
 *  output bug-for-bug (we have a parity test that compares our output to theirs).
 *
 *  Quirk preserved: when no mods are selected, `buildModifierRegex` returns a single
 *  space (poe2.re's `[null, null].join(' ')` quirk) which propagates to the final
 *  output as extra whitespace between adjacent sections. Trade regex tolerates the
 *  extra space, and matching the upstream behavior keeps the parity test honest. */
export function buildWaystoneRegex(args: BuildArgs): string {
  const { mods, tier, corruption, rarity, revives, qualifiers, quantities, selections, round10, over100, customText } =
    args
  const parts = [
    generateRarityRegex(rarity),
    buildTierRegex(tier),
    buildReviveRegex(revives),
    buildModifierRegex(mods, selections, qualifiers, round10, over100),
    buildCorruptionRegex(corruption),
    ...buildQuantifierRegexes(quantities, round10, over100),
    customText || null,
  ].filter((p): p is string => p !== null)
  if (parts.length === 0) return ''
  return parts.join(' ').trim()
}

/** Port of poe2.re's generateReviveRegex: matches the waystone's revive count line.
 *  Inert at the full 0..6 span. */
function buildReviveRegex(revives: WaystoneRevives): string | null {
  if (revives.min > revives.max) return null
  if (revives.min < 0 || revives.max < 0) return null
  if (revives.min <= 0 && revives.max === 6) return null
  const numbers = range(revives.min, revives.max + 1)
  const regex =
    numbers.length <= 1
      ? numbers.join('')
      : numbers.length > 2
        ? `[${numbers[0]}-${numbers[numbers.length - 1]}]`
        : `[${numbers.join('')}]`
  return regex === '' ? '' : `"le: ${regex}"`
}

function buildTierRegex(tier: WaystoneTier): string | null {
  // No-op cases mirroring poe2.re: zero/negative bounds, inverted min>max, full range.
  if (tier.max === 0 && tier.min === 0) return null
  if (tier.max !== 0 && tier.min > tier.max) return null
  if (tier.min < 1 || tier.max < 1) return null
  if (tier.min <= 1 && tier.max === 16) return null

  const max = tier.max === 0 ? 16 : tier.max
  const min = tier.min

  const numbersUnder10 = range(min, Math.min(10, max + 1))
  const numbersOver10 = range(Math.max(10, min), max + 1)

  const regexUnder10 =
    numbersUnder10.length <= 1
      ? numbersUnder10.join('')
      : numbersUnder10.length > 2
        ? `[${numbersUnder10[0]}-${numbersUnder10[numbersUnder10.length - 1]}]`
        : `[${numbersUnder10.join('')}]`

  const regexOver10 =
    numbersOver10.length <= 1 ? numbersOver10.join('') : `1[${numbersOver10.map((n) => n.toString()[1]).join('')}]`

  // The "er " prefix pins each token to the "...er N)" tail of the waystone name line
  // ("Waystone (Tier 9)") so a bare `1[0-6]\)` can't false-match other parenthesized
  // numbers, e.g. "Uncut Skill Gem (Level 16)". poe2.re's July 2026 fix (commits
  // 95f6c7d5 + 19031221) prepends "er " to the joined alternation, which via regex
  // alternation precedence only reaches the first branch -- we prefix each branch
  // instead, matching the fix's intent.
  const under10 = regexUnder10 === '' ? '' : `er ${regexUnder10}\\)`
  const over10 = regexOver10 === '' ? '' : `er ${regexOver10}\\)`
  const result = [under10, over10].filter((s) => s !== '').join('|')
  return result === '' ? null : `"${result}"`
}

/** poe2.re's selectedOptionRegex (current vintage): a chosen magnitude becomes a
 *  bounded [value..modMax] range anchored on the "(min-max)" display's open paren.
 *  A falsy value (0 / undefined) yields the bare token. Mods without range data
 *  (upstream's UI cannot select those; ours guards) keep the legacy >= scalar form. */
function modToken(mod: WaystoneMod, value: number | undefined, round10: boolean, over100: boolean): string {
  if (!value) return mod.regex
  const rangeMax = mod.ranges[0]?.length === 2 ? mod.ranges[0][1] : undefined
  if (rangeMax === undefined) return `${generateNumberRegex(String(value), round10, over100)}.*${mod.regex}`
  return `${generateBoundedValueRegex(String(value), String(rangeMax), round10, over100)}.*${mod.regex}`
}

function buildModifierRegex(
  mods: WaystoneMod[],
  selections: WaystoneSelections,
  qualifiers: WaystoneQualifiers,
  round10: boolean,
  over100: boolean,
): string {
  const wantMods = mods.filter((m) => selections.want.has(m.id))
  const avoidMods = mods.filter((m) => selections.avoid.has(m.id))

  const wantRegex = wantMods.map((m) => modToken(m, selections.wantValues[m.id], round10, over100))

  const wantWithMode = selections.wantMode === 'any' ? wantRegex.join('|') : wantRegex.map((r) => `"${r}"`).join(' ')

  const goodSpecial: string[] = []
  if (qualifiers.delirious) goodSpecial.push('delir')
  if (qualifiers.anyPack) goodSpecial.push('al pac')

  const goodWithMode =
    selections.wantMode === 'any'
      ? `"${[...goodSpecial, wantWithMode].filter((s) => s !== '').join('|')}"`
      : [...goodSpecial.map((s) => `"${s}"`), wantWithMode].filter((s) => s !== '').join(' ')

  const badRegex = avoidMods.map((m) => modToken(m, selections.avoidValues[m.id], round10, over100)).join('|')

  const goodPart = goodSpecial.length + wantMods.length > 0 ? goodWithMode : null
  const badPart = badRegex.length > 0 ? `"!${badRegex}"` : null

  // Mirrors poe2.re's `[goodPart, badPart].join(' ')`: when both halves are null,
  // the join produces a single space, which threads through to the final output
  // as visible whitespace between adjacent sections. See buildWaystoneRegex notes.
  return [goodPart, badPart].join(' ')
}

function buildCorruptionRegex(corruption: WaystoneCorruption): string | null {
  if (corruption.uncorrupted && corruption.corrupted) return null
  if (corruption.corrupted) return 'corr'
  if (corruption.uncorrupted) return '!corr'
  return null
}

/** "Quantity & yield" parts: one `"<token>.*<numberRegex>%"` per set threshold, in
 *  poe2.re order. A 0/null/empty value (or a number-regex that collapses to empty)
 *  produces no part. Mirrors poe2.re's `generateQuantifiers` + `addQuantifier`. */
function buildQuantifierRegexes(quantities: WaystoneQuantities, round10: boolean, over100: boolean): string[] {
  const out: string[] = []
  for (const [key, token] of WAYSTONE_QUANTIFIER_TOKENS) {
    const value = quantities[key]
    if (!value || value <= 0) continue
    // Honor the "Match numbers over 100%" toggle here too: yield/quantity stats
    // (Pack Size, Monster Rarity, ...) commonly roll above 100%, so a 2-digit
    // threshold must still match 3-digit rolls when the toggle is on.
    const num = generateNumberRegex(String(value), round10, over100)
    if (num === '') continue
    out.push(`"${token}${num}%"`)
  }
  return out
}

function range(start: number, end: number): number[] {
  if (end - start <= 0) return []
  return Array.from({ length: end - start }, (_, i) => i + start)
}
