import { getPoeVersion } from '../../game-state'
import { getStatEntries } from './stats-cache'

// Pseudo stat mappings: combine individual mods into pseudo totals. A single
// stat can contribute to multiple pseudos (e.g. "+# to Strength and Intelligence"
// adds to both Total Life via the Str half and Total Mana via the Int half), so
// the value is an array. `minCount` suppresses the pseudo until at least N mods
// contributed (e.g. consolidated ele-damage pseudos only show when 2+ colors
// are present); `nonWeaponOnly` skips contributions on weapon items, where the
// DPS pipeline already aggregates added damage.
export type PseudoContribution = {
  pseudoId: string
  pseudoLabel: string
  multiplier: number
  minCount?: number
  nonWeaponOnly?: boolean
  /** When true, the individual mod row that feeds this pseudo is NOT disabled by
   *  the explicits producer (the default for total-life/total-res pseudos, which
   *  replace their source rows). Used by the PoE2 "Damage as Extra" summary rows,
   *  which are additive convenience rows layered on top of the real mod rows. */
  keepSourceRow?: boolean
  /** When true, the emitted pseudo row defaults to unchecked (enabled: false) so it
   *  is an opt-in summary rather than an active filter. */
  disabledByDefault?: boolean
  /** When true, this contribution comes from an attribute mod (Str -> Life, Int -> Mana)
   *  rather than a direct life/mana/resistance mod. Attribute contributions are deferred:
   *  they only fold in and suppress the source row when the same pseudo also has at least
   *  one non-attribute (real) contributor on the same item. */
  attributeDerived?: boolean
}

export const PSEUDO_CONTRIBUTIONS: Record<string, PseudoContribution[]> = {}

// Inverted view of PSEUDO_CONTRIBUTIONS used by the PoE2 Weighted Sum path:
// pseudoId -> the full universe of contributing real stat ids (deduped). The
// trade2 weight group sums these at the implicit default weight of 1, so only the
// ids matter here; the per-stat multiplier stays in PSEUDO_CONTRIBUTIONS for the
// accumulator total. Built in buildPseudoMap(), cleared by resetPseudoMap().
export const PSEUDO_WEIGHT_GROUPS: Record<string, Array<{ id: string }>> = {}

function buildPseudoMap(): void {
  // Attribute -> resource conversions baked into PoE1: each Strength gives
  // 0.5 Life, each Intelligence gives 0.5 Mana. Hybrid attribute mods (Str+Int,
  // all attributes) contribute via both halves. Anchored patterns so "+# to
  // Strength" doesn't also match "+# to Strength and Intelligence".
  type Mapping = [
    RegExp,
    string,
    string,
    number?,
    {
      minCount?: number
      nonWeaponOnly?: boolean
      keepSourceRow?: boolean
      disabledByDefault?: boolean
      attributeDerived?: boolean
    }?,
  ]
  const ELE_DMG_OPTS = { minCount: 2, nonWeaponOnly: true }
  const pseudoMappings: Mapping[] = [
    [
      /to (?:fire|cold|lightning) resistance/i,
      'pseudo.pseudo_total_elemental_resistance',
      'Total Elemental Resistance',
    ],
    [
      /to (?:fire|cold|lightning) and (?:fire|cold|lightning) resistances/i,
      'pseudo.pseudo_total_elemental_resistance',
      'Total Elemental Resistance',
      2,
    ],
    [/to all elemental resistances/i, 'pseudo.pseudo_total_elemental_resistance', 'Total Elemental Resistance', 3],
    [/to chaos resistance/i, 'pseudo.pseudo_total_chaos_resistance', 'Total Chaos Resistance'],
    // Hybrid elemental + chaos master crafted ("of Craft"). The same rolled value
    // feeds both pseudos: total ele res (one elemental color) and total chaos res.
    [
      /to (?:fire|cold|lightning) and chaos resistances/i,
      'pseudo.pseudo_total_elemental_resistance',
      'Total Elemental Resistance',
    ],
    [
      /to (?:fire|cold|lightning) and chaos resistances/i,
      'pseudo.pseudo_total_chaos_resistance',
      'Total Chaos Resistance',
    ],
    [/to maximum life/i, 'pseudo.pseudo_total_life', 'Total Life'],
    [/to maximum mana/i, 'pseudo.pseudo_total_mana', 'Total Mana'],
    // Strength: +# Str alone, +# Str+Dex hybrid, +# Str+Int hybrid, +# all Attrs
    [/^\+?# to Strength$/i, 'pseudo.pseudo_total_life', 'Total Life', 0.5, { attributeDerived: true }],
    [/^\+?# to Strength and Dexterity$/i, 'pseudo.pseudo_total_life', 'Total Life', 0.5, { attributeDerived: true }],
    [/^\+?# to Strength and Intelligence$/i, 'pseudo.pseudo_total_life', 'Total Life', 0.5, { attributeDerived: true }],
    [/^\+?# to all Attributes$/i, 'pseudo.pseudo_total_life', 'Total Life', 0.5, { attributeDerived: true }],
    // Intelligence: +# Int alone, +# Dex+Int hybrid, +# Str+Int hybrid, +# all Attrs
    [/^\+?# to Intelligence$/i, 'pseudo.pseudo_total_mana', 'Total Mana', 0.5, { attributeDerived: true }],
    [
      /^\+?# to Dexterity and Intelligence$/i,
      'pseudo.pseudo_total_mana',
      'Total Mana',
      0.5,
      { attributeDerived: true },
    ],
    [/^\+?# to Strength and Intelligence$/i, 'pseudo.pseudo_total_mana', 'Total Mana', 0.5, { attributeDerived: true }],
    [/^\+?# to all Attributes$/i, 'pseudo.pseudo_total_mana', 'Total Mana', 0.5, { attributeDerived: true }],
  ]

  // Added elemental damage rolls -- consolidated into the trade pseudo when 2+
  // colors are present on a non-weapon (gloves Painseeker / belt Prismweave
  // patterns). Weapons skip; their DPS chips already aggregate added damage.
  // "Spells and Attacks" hybrid implicits contribute to both attack and spell
  // pseudos. Generated by cross-product since the trade API has separate stat
  // IDs per (color, suffix) pair but the consolidated pseudo only cares about
  // the suffix.
  const ATTACKS_PSEUDO = {
    id: 'pseudo.pseudo_adds_elemental_damage_to_attacks',
    label: 'Adds # to # Elemental Damage to Attacks',
  }
  const SPELLS_PSEUDO = {
    id: 'pseudo.pseudo_adds_elemental_damage_to_spells',
    label: 'Adds # to # Elemental Damage to Spells',
  }
  const PLAIN_PSEUDO = { id: 'pseudo.pseudo_adds_elemental_damage', label: 'Adds # to # Elemental Damage' }
  const ELE_VARIANTS: Array<{ suffix: string; pseudos: Array<{ id: string; label: string }> }> = [
    { suffix: '', pseudos: [PLAIN_PSEUDO] },
    { suffix: ' to Attacks', pseudos: [ATTACKS_PSEUDO] },
    { suffix: ' to Spells', pseudos: [SPELLS_PSEUDO] },
    { suffix: ' to Spells and Attacks', pseudos: [ATTACKS_PSEUDO, SPELLS_PSEUDO] },
  ]
  for (const color of ['Fire', 'Cold', 'Lightning']) {
    for (const v of ELE_VARIANTS) {
      const re = new RegExp(`^Adds # to # ${color} Damage${v.suffix}$`, 'i')
      for (const p of v.pseudos) pseudoMappings.push([re, p.id, p.label, 1, ELE_DMG_OPTS])
    }
  }

  // PoE2-only: "Gain #% of Damage as Extra <element> Damage" summary pseudos. Two
  // opt-in, additive rows that weighted-sum the four affixes. The three elemental
  // colors feed both the ele-only and the ele+chaos totals; chaos feeds ele+chaos
  // only. Anchored so "Attacks Gain ...", "Monsters deal ... as Extra Fire", and
  // "Gain ...% of Damage as Chaos Damage per Undead Minion" are NOT matched.
  // keepSourceRow: the four real mod rows stay enabled; these are extras on top.
  // disabledByDefault: emitted unchecked - the user opts in.
  if (getPoeVersion() === 2) {
    const EXTRA_ELE = { id: 'pseudo.pseudo_damage_as_extra_elemental', label: 'Damage as Extra (Ele)' }
    const EXTRA_ELE_CHAOS = {
      id: 'pseudo.pseudo_damage_as_extra_elemental_chaos',
      label: 'Damage as Extra (Ele+Chaos)',
    }
    const EXTRA_OPTS = { keepSourceRow: true, disabledByDefault: true }
    const extraColors: Array<{ color: string; pseudos: Array<{ id: string; label: string }> }> = [
      { color: 'Fire', pseudos: [EXTRA_ELE, EXTRA_ELE_CHAOS] },
      { color: 'Cold', pseudos: [EXTRA_ELE, EXTRA_ELE_CHAOS] },
      { color: 'Lightning', pseudos: [EXTRA_ELE, EXTRA_ELE_CHAOS] },
      { color: 'Chaos', pseudos: [EXTRA_ELE_CHAOS] },
    ]
    for (const { color, pseudos } of extraColors) {
      const re = new RegExp(`^Gain #% of Damage as Extra ${color} Damage$`, 'i')
      for (const p of pseudos) pseudoMappings.push([re, p.id, p.label, 1, EXTRA_OPTS])
    }
  }

  const statEntries = getStatEntries()
  for (const entry of statEntries) {
    // Runes feed pseudos too (a +res rune counts toward Total Elemental Resistance).
    // GGG's stats payload gives the rune category id "rune" (so stat ids are
    // rune.stat_*) but tags each entry's `type` as "augment", not "rune" -- so detect
    // runes by id prefix, not entry.type.
    const isRune = entry.id.startsWith('rune.')
    if (entry.type !== 'explicit' && entry.type !== 'implicit' && entry.type !== 'crafted' && !isRune) continue
    // "Inflict <Ele> Exposure on Hit, applying -#% to <Ele> Resistance" is an
    // enemy debuff, not player resistance. Its text contains "to <Ele>
    // Resistance" so the loose resistance patterns below would otherwise sum
    // the negative value into the player's Total Elemental Resistance pseudo.
    // Exposure mods never feed any player pseudo, so skip them outright.
    if (/\bExposure\b/i.test(entry.text)) continue
    for (const [pattern, pseudoId, pseudoLabel, multiplier, opts] of pseudoMappings) {
      if (pattern.test(entry.text)) {
        if (!PSEUDO_CONTRIBUTIONS[entry.id]) PSEUDO_CONTRIBUTIONS[entry.id] = []
        PSEUDO_CONTRIBUTIONS[entry.id].push({
          pseudoId,
          pseudoLabel,
          multiplier: multiplier ?? 1,
          ...(opts ?? {}),
        })
        if (!PSEUDO_WEIGHT_GROUPS[pseudoId]) PSEUDO_WEIGHT_GROUPS[pseudoId] = []
        // First match wins if two patterns overlap for the same (entry.id, pseudoId).
        if (!PSEUDO_WEIGHT_GROUPS[pseudoId].some((w) => w.id === entry.id)) {
          PSEUDO_WEIGHT_GROUPS[pseudoId].push({ id: entry.id })
        }
      }
    }
  }
}

export type PseudoAccumulatorEntry = {
  pseudoId: string
  pseudoLabel: string
  total: number
  count: number
  minCount: number
  disabledByDefault: boolean
}

/** Roll the contributions of a matched mod into the running pseudo accumulator.
 *  A single mod can feed multiple pseudos (e.g. a "+# to Strength and Intelligence"
 *  hybrid contributes to both Total Life and Total Mana). Skips contributions
 *  flagged `nonWeaponOnly` when the item is a weapon, since the DPS chips already
 *  aggregate weapon-local damage. Tracks contribution count so the emitter can
 *  drop pseudos that need a quorum (e.g. ele-damage pseudo only shows when 2+
 *  colors contribute -- a single-color roll has its own row already). */
export function accumulatePseudo(
  acc: Record<string, PseudoAccumulatorEntry>,
  contributions: PseudoContribution[],
  value: number,
  isWeapon: boolean,
): void {
  for (const c of contributions) {
    if (c.nonWeaponOnly && isWeapon) continue
    if (!acc[c.pseudoId]) {
      acc[c.pseudoId] = {
        pseudoId: c.pseudoId,
        pseudoLabel: c.pseudoLabel,
        total: 0,
        count: 0,
        minCount: c.minCount ?? 1,
        disabledByDefault: c.disabledByDefault ?? false,
      }
    }
    acc[c.pseudoId].total += value * c.multiplier
    acc[c.pseudoId].count += 1
  }
}

/** Lazy-init the pseudo map if it hasn't been built yet and stat entries are
 *  available. Replaces the inline check previously in matchItemMods.
 *
 *  Version-dependent: buildPseudoMap reads getPoeVersion() to decide whether to
 *  register the PoE2-only "Damage as Extra" mappings, and the result is cached for
 *  the process lifetime. This is safe today because stat entries arrive (via the
 *  trade API fetch) well after createOverlayWindow sets the version at startup, so
 *  the first build always sees the correct game. If startup ordering ever changes
 *  so stats can be present before setPoeVersion runs, gate this on the version
 *  being known, or resetPseudoMap once it is. */
export function ensurePseudoMapBuilt(): void {
  if (Object.keys(PSEUDO_CONTRIBUTIONS).length === 0 && getStatEntries().length > 0) buildPseudoMap()
}

/** Clear the pseudo contributions map. Called by the test hook in index.ts so
 *  each test rebuilds from its own seeded entries. */
export function resetPseudoMap(): void {
  for (const k of Object.keys(PSEUDO_CONTRIBUTIONS)) delete PSEUDO_CONTRIBUTIONS[k]
  for (const k of Object.keys(PSEUDO_WEIGHT_GROUPS)) delete PSEUDO_WEIGHT_GROUPS[k]
}

/** @deprecated Use resetPseudoMap instead. Kept for test compatibility. */
export const _resetPseudoMap = resetPseudoMap
