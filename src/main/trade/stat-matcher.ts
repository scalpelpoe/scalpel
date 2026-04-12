import { net } from 'electron'
import type { AdvancedMod } from '../../shared/types'
import { POE_TRADE_API } from '../../shared/endpoints'
import { ATZOATL_ROOMS, ATZOATL_KEY_ROOMS } from '../../shared/data/trade/atzoatl'
import { BENEFICIAL_NEGATIVE_KEYWORDS } from '../../shared/data/trade/beneficial-negatives'
import type { StatFilter } from './trade'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatEntry {
  id: string
  text: string
  type: string
  option?: { options: Array<{ id: number; text: string }> }
}

// ─── Item Class to Trade Category ─────────────────────────────────────────────

export const ITEM_CLASS_TO_CATEGORY: Record<string, string> = {
  Rings: 'accessory.ring',
  Amulets: 'accessory.amulet',
  Belts: 'accessory.belt',
  Helmets: 'armour.helmet',
  'Body Armours': 'armour.chest',
  Gloves: 'armour.gloves',
  Boots: 'armour.boots',
  Shields: 'armour.shield',
  Quivers: 'armour.quiver',
  Bows: 'weapon.bow',
  Claws: 'weapon.claw',
  Daggers: 'weapon.dagger',
  'One Hand Axes': 'weapon.oneaxe',
  'One Hand Maces': 'weapon.onemace',
  'One Hand Swords': 'weapon.onesword',
  Sceptres: 'weapon.sceptre',
  Staves: 'weapon.staff',
  'Thrusting One Hand Swords': 'weapon.onesword',
  'Two Hand Axes': 'weapon.twoaxe',
  'Two Hand Maces': 'weapon.twomace',
  'Two Hand Swords': 'weapon.twosword',
  Wands: 'weapon.wand',
  Warstaves: 'weapon.warstaff',
  'Rune Daggers': 'weapon.runedagger',
  Jewels: 'jewel',
  Flasks: 'flask',
}

// ─── Stat Matcher ─────────────────────────────────────────────────────────────

let statEntries: StatEntry[] = []
let statsFetched = false

// Build regex patterns from stat text: "+# to maximum Life" -> /^\+(\d+(?:\.\d+)?) to maximum Life$/
function statTextToPattern(text: string): RegExp {
  // Escape regex special chars except #
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#/g, '(.+?)')
  return new RegExp('^' + escaped + '$', 'i')
}

/** Fetch stat entries from the PoE trade API (simple GET, no rate limiting needed) */
async function fetchStats(): Promise<void> {
  if (statsFetched) return
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const request = net.request({
        url: `${POE_TRADE_API}/data/stats`,
        method: 'GET',
      })
      request.setHeader('Content-Type', 'application/json')
      request.setHeader('User-Agent', 'FilterScalpel/1.0')
      let body = ''
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          body += chunk.toString()
        })
        response.on('end', () => resolve(body))
      })
      request.on('error', reject)
      request.end()
    })
    const resp = JSON.parse(data) as {
      result: Array<{ id: string; label: string; entries: StatEntry[] }>
    }
    statEntries = resp.result.flatMap((cat) => cat.entries)
    statsFetched = true
  } catch (e) {
    console.error('[trade] Failed to fetch stats:', e)
  }
}

export { fetchStats as ensureStatsLoaded }

// Mod patterns that are LOCAL when on weapons/armour
const LOCAL_MOD_PATTERNS = [
  /^\+?\d+(?:\.\d+)?%? (?:increased |to )(?:Armour|Evasion Rating|Energy Shield|Armour and Evasion|Armour and Energy Shield|Evasion and Energy Shield|Armour, Evasion and Energy Shield|maximum Energy Shield|Ward)/i,
  /^Adds \d+ to \d+ (?:Physical|Fire|Cold|Lightning|Chaos) Damage$/i,
  /^\d+(?:\.\d+)?% increased Attack Speed$/i,
  /^\+\d+ to Accuracy Rating$/i,
  /^\d+(?:\.\d+)?% of Physical Attack Damage Leeched as (?:Life|Mana)$/i,
  /^\d+(?:\.\d+)?% chance to Poison on Hit$/i,
]

function isLocalMod(modText: string): boolean {
  return LOCAL_MOD_PATTERNS.some((p) => p.test(modText))
}

// Item classes that have local defense mods
const ARMOUR_CLASSES = new Set(['Helmets', 'Body Armours', 'Gloves', 'Boots', 'Shields'])
// Item classes that have local weapon mods
const WEAPON_CLASSES = new Set([
  'Bows',
  'Claws',
  'Daggers',
  'One Hand Axes',
  'One Hand Maces',
  'One Hand Swords',
  'Sceptres',
  'Staves',
  'Thrusting One Hand Swords',
  'Two Hand Axes',
  'Two Hand Maces',
  'Two Hand Swords',
  'Wands',
  'Warstaves',
  'Rune Daggers',
])

/**
 * Generate singular/alternate text variants for plural PoE mod text.
 * The trade API uses singular stat text but the clipboard may have plural forms.
 */
function generateTextVariants(text: string): string[] {
  const variants = [text]
  // Negative mods: "-50% to Lightning Resistance" needs to match stat pattern "+#% to Lightning Resistance"
  // Generate a variant with + prefix so the pattern matches, but preserve negative value for extraction
  if (/^-\d/.test(text)) {
    variants.push(text.replace(/^-/, '+'))
  }
  // "reduced" is stored as negative "increased" in trade API
  if (/\breduced\b/i.test(text)) {
    variants.push(text.replace(/\breduced\b/i, 'increased'))
  }
  // "less" is stored as negative "more" in trade API
  if (/\bless\b/i.test(text)) {
    variants.push(text.replace(/\bless\b/i, 'more'))
  }
  // Common PoE plural -> singular transformations
  const replacements: Array<[RegExp, string]> = [
    [/Flasks constantly apply their Flask Effects/g, 'Flask constantly applies its Flask Effect'],
    [/Flasks constantly apply their/g, 'Flask constantly applies its'],
    [/Skills are Jewel Sockets/g, 'Skill is a Jewel Socket'],
    [/Flasks/g, 'Flask'],
    [/Charges/g, 'Charge'],
    [/Effects/g, 'Effect'],
    [/Sockets/g, 'Socket'],
    [/Skills are/g, 'Skill is'],
    [/apply their/g, 'applies its'],
    [/have /g, 'has '],
    [/the matching modifier/g, 'matching modifier'],
  ]
  for (const [pattern, replacement] of replacements) {
    if (pattern.test(text)) {
      variants.push(text.replace(pattern, replacement))
    }
  }
  return variants
}

export function matchModToStat(
  modText: string,
  preferLocal = false,
  modType: 'explicit' | 'crafted' | 'implicit' | 'enchant' | 'imbued' = 'explicit',
): { statId: string; value: number | null; option?: number } | null {
  const typePrefix = modType + '.'
  const textVariants = generateTextVariants(modText)

  const isNegativeMod = /^-\d/.test(modText)
  const isReducedMod = /\breduced\b/i.test(modText)
  const isLessMod = /\bless\b/i.test(modText)

  for (const variant of textVariants) {
    let nonLocalMatch: { statId: string; value: number | null; option?: number; _textLen: number } | null = null
    let localMatch: { statId: string; value: number | null; option?: number; _textLen: number } | null = null

    for (const entry of statEntries) {
      if (!entry.id.startsWith(typePrefix)) continue
      const isLocal = entry.text.includes('(Local)')
      const textForPattern = isLocal ? entry.text.replace(/\s*\(Local\)/, '') : entry.text
      const pattern = statTextToPattern(textForPattern)
      const match = variant.match(pattern)
      if (match) {
        // For stats with two numeric values (e.g. "Adds # to # Damage"), average them
        const numericCaptures = Array.from(match)
          .slice(1)
          .filter((v) => v && /^\d+(?:\.\d+)?$/.test(v))
        const rawValue = match[1]
        let value: number | null
        if (numericCaptures.length >= 2) {
          value = numericCaptures.reduce((sum, v) => sum + parseFloat(v), 0) / numericCaptures.length
        } else {
          value = rawValue && /^\d+(?:\.\d+)?$/.test(rawValue) ? parseFloat(rawValue) : null
        }
        // Restore negative sign when matching via sign-flipped variant
        if (isNegativeMod && value != null && value > 0) value = -value
        // "reduced" / "less" mods are negative "increased" / "more" in trade API
        if ((isReducedMod || isLessMod) && value != null && value > 0) value = -value
        // For option-based stats (like "Map contains #'s Citadel"), resolve the option ID
        let option: number | undefined
        if (entry.option && rawValue && !value) {
          const opt = entry.option.options.find((o) => o.text === rawValue)
          if (opt) option = opt.id
        }
        const result = { statId: entry.id, value, option, _textLen: entry.text.length }
        if (isLocal) {
          if (!localMatch || entry.text.length > localMatch._textLen) localMatch = result
        } else {
          if (!nonLocalMatch || entry.text.length > nonLocalMatch._textLen) nonLocalMatch = result
        }
      }
    }

    const result =
      preferLocal && localMatch ? localMatch : !preferLocal && nonLocalMatch ? nonLocalMatch : nonLocalMatch
    if (result) return result
  }

  return null
}

// Mods that are generally not useful for pricing
const LOW_PRIORITY_PATTERNS = [
  /rarity of items found/i,
  /light radius/i,
  /mana regeneration rate/i,
  /reflects .* physical damage/i,
  /knockback/i,
  /reduced attribute requirements/i,
  /increased stun duration/i,
  /life regenerated per second/i,
  /thorns/i,
  /stun and block recovery/i,
  /stun duration on enemies/i,
  /adds.*passive skills/i,
  /small passive skills which grant nothing/i,
]

// Pseudo stat mappings: combine individual mods into pseudo totals
const PSEUDO_CONTRIBUTIONS: Record<string, { pseudoId: string; pseudoLabel: string; multiplier: number }> = {}

function buildPseudoMap(): void {
  const pseudoMappings: Array<[RegExp, string, string, number?]> = [
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
    [/to maximum life/i, 'pseudo.pseudo_total_life', 'Total Life'],
  ]

  for (const entry of statEntries) {
    if (entry.type !== 'explicit' && entry.type !== 'implicit' && entry.type !== 'crafted') continue
    for (const [pattern, pseudoId, pseudoLabel, multiplier] of pseudoMappings) {
      if (pattern.test(entry.text)) {
        PSEUDO_CONTRIBUTIONS[entry.id] = { pseudoId, pseudoLabel, multiplier: multiplier ?? 1 }
      }
    }
  }
}

function isLowPriority(modText: string): boolean {
  return LOW_PRIORITY_PATTERNS.some((p) => p.test(modText))
}

const DEFENSE_MOD_PATTERNS = [
  /to armour/i,
  /increased armour/i,
  /to evasion rating/i,
  /increased evasion rating/i,
  /to maximum energy shield/i,
  /increased maximum energy shield/i,
  /to ward/i,
  /increased ward/i,
  /chance to block/i,
]

function isDefenseMod(modText: string): boolean {
  return DEFENSE_MOD_PATTERNS.some((p) => p.test(modText))
}

export function matchItemMods(
  explicits: string[],
  implicits: string[],
  defenses?: { armour: number; evasion: number; energyShield: number; ward: number; block: number },
  itemInfo?: {
    sockets: string
    linkedSockets: number
    quality: number
    itemLevel: number
    baseType: string
    rarity: string
    itemClass: string
    gemLevel: number
    corrupted: boolean
    mirrored: boolean
    identified?: boolean
    influence?: string[]
    mapQuantity?: number
    mapRarity?: number
    mapPackSize?: number
    mapMoreScarabs?: number
    mapMoreCurrency?: number
    mapMoreMaps?: number
    mapMoreDivCards?: number
    enchants?: string[]
    imbues?: string[]
    memoryStrands?: number
    physDamageMin?: number
    physDamageMax?: number
    eleDamageAvg?: number
    chaosDamageAvg?: number
    attacksPerSecond?: number
    monsterLevel?: number
    wingsRevealed?: number
    wingsTotal?: number
    mapReward?: string
    transfigured?: boolean
    synthesised?: boolean
    logbookFactions?: string[]
    logbookBosses?: string[]
    atzoatlRooms?: string[]
    atzoatlOpenCount?: number
    storedExperience?: number
  },
  advancedMods?: AdvancedMod[],
  defaultPercent = 90,
): StatFilter[] {
  const pct = defaultPercent / 100
  const filters: StatFilter[] = []
  const pseudoAccumulator: Record<string, { pseudoId: string; pseudoLabel: string; total: number }> = {}
  const hasDefenses =
    defenses &&
    (defenses.armour > 0 ||
      defenses.evasion > 0 ||
      defenses.energyShield > 0 ||
      defenses.ward > 0 ||
      defenses.block > 0)

  // Build pseudo map if needed
  if (Object.keys(PSEUDO_CONTRIBUTIONS).length === 0 && statEntries.length > 0) {
    buildPseudoMap()
  }

  for (const mod of implicits) {
    const cleaned = mod.replace(/\s*\(implicit\)\s*$/i, '').trim()
    // Try implicit stats first, then fall back to explicit (non-local, then local) and remap the ID
    const matched =
      matchModToStat(cleaned, false, 'implicit') ??
      (() => {
        const fallback = matchModToStat(cleaned, false, 'explicit') ?? matchModToStat(cleaned, true, 'explicit')
        if (!fallback) return null
        return { ...fallback, statId: 'implicit.' + fallback.statId.split('.')[1] }
      })()
    if (matched) {
      // Check if this contributes to a pseudo stat
      // Skip "X per Y" mods -- they're conditional and shouldn't inflate pseudo totals
      const isPerMod = /\bper\b/i.test(cleaned)
      const pseudo = PSEUDO_CONTRIBUTIONS[matched.statId]
      if (pseudo && matched.value != null && !isPerMod) {
        if (!pseudoAccumulator[pseudo.pseudoId]) {
          pseudoAccumulator[pseudo.pseudoId] = { ...pseudo, total: 0 }
        }
        pseudoAccumulator[pseudo.pseudoId].total += matched.value * pseudo.multiplier
      }
      // Check if this implicit is from eldritch (Searing Exarch / Eater of Worlds)
      let isEldritch = false
      if (advancedMods) {
        const advMod = advancedMods.find((am) => {
          if (am.type !== 'implicit') return false
          const joinedLines = am.lines
            .filter((l) => !l.startsWith('('))
            .map((l) =>
              l
                .replace(/(-?\d+(?:\.\d+)?)\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)/g, '$1')
                .replace(/([a-zA-Z]\w*)\s*\([^)]*\)/g, '$1')
                .trim(),
            )
            .filter(Boolean)
            .join('\n')
          return joinedLines === cleaned
        })
        if (advMod?.eldritch) isEldritch = true
      }
      filters.push({
        id: matched.statId,
        text: cleaned,
        value: matched.value,
        min: matched.option ? null : matched.value,
        max: null,
        enabled:
          !!itemInfo?.corrupted ||
          !!itemInfo?.synthesised ||
          (!!matched.option && itemInfo?.itemClass !== 'Expedition Logbooks') ||
          itemInfo?.itemClass === 'Maps',
        type: 'implicit',
        option: matched.option,
      })
    }
  }

  const hasLocalMods = itemInfo && (ARMOUR_CLASSES.has(itemInfo.itemClass) || WEAPON_CLASSES.has(itemInfo.itemClass))
  const isGemItem =
    itemInfo &&
    ['Gems', 'Support Gems', 'Skill Gems', 'Active Skill Gems', 'Support Skill Gems'].includes(itemInfo.itemClass)
  const isTimelessJewel = itemInfo?.baseType === 'Timeless Jewel'

  for (const mod of isGemItem ? [] : explicits) {
    let isCrafted = /\s*\(crafted\)\s*$/i.test(mod)
    let cleaned = mod.replace(/\s*\(crafted\)\s*$/i, '').trim()
    // Skip timeless jewel mods handled by the timeless chip system
    if (
      isTimelessJewel &&
      (/Passives in radius are Conquered/i.test(cleaned) ||
        /^Historic$/i.test(cleaned) ||
        /Commanded|Commissioned|Carved|Bathed|Denoted|Remembrancing/i.test(cleaned))
    )
      continue
    const useLocal = hasLocalMods && isLocalMod(cleaned)
    const matched = matchModToStat(cleaned, useLocal, isCrafted ? 'crafted' : 'explicit')
    if (matched) {
      const lowPriority = isLowPriority(cleaned)

      // Check if this mod is fractured or foulborn (from advanced mod data)
      let isFractured = false
      let isFoulborn = false
      if (advancedMods) {
        const advMod = advancedMods.find((am) => {
          if (am.type === 'implicit') return false
          const joinedLines = am.lines
            .filter((l) => !l.startsWith('('))
            .map((l) =>
              l
                .replace(/(-?\d+(?:\.\d+)?)\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)/g, '$1')
                .replace(/([a-zA-Z]\w*)\s*\([^)]*\)/g, '$1')
                .replace(/\s*[\u2014\u2013\-]+\s*Unscalable Value$/i, '')
                .trim(),
            )
            .filter(Boolean)
            .join('\n')
          return joinedLines === cleaned
        })
        if (advMod?.fractured) isFractured = true
        if (advMod?.foulborn) isFoulborn = true
        if (advMod?.crafted) isCrafted = true
        // Apply magnitude multiplier from implicit (e.g. Cogwork Ring "25% increased Suffix Modifier magnitudes")
        if (advMod?.magnitudeMultiplier && matched.value != null) {
          const oldVal = matched.value
          matched.value = Math.trunc(oldVal * advMod.magnitudeMultiplier)
          // Update the display text to show the multiplied value
          cleaned = cleaned.replace(String(Math.abs(oldVal)), String(Math.abs(matched.value)))
        }
      }

      // Tinctures: disambiguate duplicate stat texts (e.g. "#% increased effect" has two stat IDs)
      const TINCTURE_STAT_REMAP: Record<string, string> = {
        'explicit.stat_2448920197': 'explicit.stat_3529940209', // "#% increased effect" -> tincture-specific variant
      }
      if (itemInfo?.itemClass === 'Tinctures' && TINCTURE_STAT_REMAP[matched.statId]) {
        matched.statId = TINCTURE_STAT_REMAP[matched.statId]
      }

      // Remap stat ID prefix based on mod source (fractured/crafted)
      if (isFractured && matched.statId.startsWith('explicit.')) {
        matched.statId = 'fractured.' + matched.statId.split('.').slice(1).join('.')
      } else if (isCrafted && matched.statId.startsWith('explicit.')) {
        matched.statId = 'crafted.' + matched.statId.split('.').slice(1).join('.')
      }

      // Determine if this value is fixed or rolled
      // Fixed values (min === max in tier range, or no range) use exact match
      // Rolled values use percentage-based min
      let isFixedValue = false
      if (advancedMods && matched.value != null) {
        const advMod = advancedMods.find((am) => {
          if (am.type === 'implicit') return false
          const joinedLines = am.lines
            .filter((l) => !l.startsWith('('))
            .map((l) =>
              l
                .replace(/(-?\d+(?:\.\d+)?)\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)/g, '$1')
                .replace(/([a-zA-Z]\w*)\s*\([^)]*\)/g, '$1')
                .trim(),
            )
            .filter(Boolean)
            .join('\n')
          return joinedLines === cleaned || joinedLines === mod.replace(/\s*\(crafted\)\s*$/i, '').trim()
        })
        if (advMod) {
          const range = advMod.ranges.find((r) => r.value === matched.value || r.value === -(matched.value ?? 0))
          if (range && range.min === range.max) isFixedValue = true
          if (!range && advMod.ranges.length === 0) isFixedValue = true
        }
      }
      // For negative values: "reduced" mods use min (trade API expects min for beneficial reduction),
      // while truly negative mods (e.g. "-50% to Lightning Resistance") use max.
      const isNegative = matched.value != null && matched.value < 0
      // Negative mods: default to "bad" (less negative = better, use min).
      // Some keywords indicate the negative is beneficial (more negative = better, use max).
      const isBeneficialNegative = isNegative && BENEFICIAL_NEGATIVE_KEYWORDS.some((p) => p.test(mod))
      const minValue =
        matched.value != null && (!isNegative || !isBeneficialNegative)
          ? isFixedValue || isNegative
            ? matched.value
            : Math.floor(matched.value * pct)
          : null
      const maxValue = isBeneficialNegative && matched.value != null ? matched.value : null

      // Check if this contributes to a pseudo stat
      // Skip for cluster jewels -- their mods grant passives, not item stats
      // Skip "X per Y" mods -- they're conditional and shouldn't inflate pseudo totals
      const isPerMod = /\bper\b/i.test(cleaned)
      const isCluster = itemInfo?.baseType?.includes('Cluster Jewel')
      const pseudo = isCluster || isPerMod ? undefined : PSEUDO_CONTRIBUTIONS[matched.statId]
      if (pseudo && matched.value != null) {
        if (!pseudoAccumulator[pseudo.pseudoId]) {
          pseudoAccumulator[pseudo.pseudoId] = { ...pseudo, total: 0 }
        }
        pseudoAccumulator[pseudo.pseudoId].total += matched.value * pseudo.multiplier
      }

      // Hybrid companion detection: if this mod shares an advanced mod block with a
      // "Socketed Gems are Supported by" line but ISN'T the socketed gem line itself,
      // it's the less important hybrid bonus and should be off by default
      let isHybridCompanion = false
      if (advancedMods && !/^Socketed Gems are Supported by/i.test(cleaned)) {
        const parentMod = advancedMods.find(
          (am) =>
            am.type !== 'implicit' &&
            am.lines.some((l) => /Socketed Gems are Supported by/i.test(l)) &&
            am.lines.some((l) => {
              const s = l
                .replace(/(-?\d+(?:\.\d+)?)\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)/g, '$1')
                .replace(/([a-zA-Z]\w*)\s*\([^)]*\)/g, '$1')
                .replace(/\s*[\u2014\u2013\-]+\s*Unscalable Value$/i, '')
                .trim()
              return s === cleaned
            }),
        )
        if (parentMod) isHybridCompanion = true
      }

      filters.push({
        id: matched.statId,
        text: isFractured ? `${cleaned} (Fractured)` : cleaned,
        value: matched.value,
        min: minValue,
        max: maxValue,
        enabled:
          isFractured ||
          isFoulborn ||
          (!lowPriority &&
            !isCrafted &&
            !pseudo &&
            !isHybridCompanion &&
            !(hasDefenses && isDefenseMod(cleaned)) &&
            !useLocal &&
            !(itemInfo?.itemClass === 'Maps')),
        type: isFractured ? 'fractured' : isCrafted ? 'crafted' : 'explicit',
        option: matched.option,
        foulborn: isFoulborn || undefined,
      })
      // For fractured mods, also add the unfractured (explicit) version, disabled by default
      if (isFractured) {
        const explicitId = 'explicit.' + matched.statId.split('.').slice(1).join('.')
        filters.push({
          id: explicitId,
          text: cleaned,
          value: matched.value,
          min: minValue,
          max: null,
          enabled: false,
          type: 'explicit',
        })
      }
    }
  }

  // Process imbue lines (gem imbued supports)
  const imbueFilters: StatFilter[] = []
  if (itemInfo?.imbues) {
    for (const imbue of itemInfo.imbues) {
      const matched = matchModToStat(imbue, false, 'imbued')
      if (matched) {
        imbueFilters.push({
          id: matched.statId,
          text: imbue,
          value: null,
          min: null,
          max: null,
          enabled: true,
          type: 'imbued',
        })
      }
    }
  }

  // Process enchant lines (cluster jewel enchantments)
  const enchantFilters: StatFilter[] = []
  if (itemInfo?.enchants) {
    for (const enchant of itemInfo.enchants) {
      const matched = matchModToStat(enchant, false, 'enchant')
      if (matched) {
        let minVal = matched.option ? null : matched.value
        // Medium cluster jewels: 5 passives is functionally identical to 4
        if (itemInfo.baseType === 'Medium Cluster Jewel' && matched.value === 5 && enchant.includes('Adds')) {
          minVal = 4
        }
        enchantFilters.push({
          id: matched.statId,
          text: enchant,
          value: matched.value,
          min: minVal,
          max: null,
          enabled: true,
          type: 'enchant',
          option: matched.option,
        })
      }
    }
  }

  // Add pseudo stats at the top of the list
  const pseudoFilters: StatFilter[] = Object.entries(pseudoAccumulator).map(([id, data]) => ({
    id,
    text: data.pseudoLabel,
    value: data.total,
    min: Math.floor(data.total * pct),
    max: null,
    enabled: true,
    type: 'pseudo',
  }))

  // Quality normalization: scale stats to 20% quality if item is below 20%
  // Quality affects base phys damage on weapons and base armour/evasion/ES on armour
  const quality = itemInfo?.quality ?? 0
  const qualityNorm = quality < 20 ? 1.2 / (1 + quality / 100) : 1

  // Add defense filters as special "defence" type
  const defenseFilters: StatFilter[] = []
  if (defenses) {
    const ar = Math.round(defenses.armour * qualityNorm)
    const ev = Math.round(defenses.evasion * qualityNorm)
    const es = Math.round(defenses.energyShield * qualityNorm)
    if (ar > 0)
      defenseFilters.push({
        id: 'defence.armour',
        text: `Armour: ${ar}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: ar,
        min: Math.floor(ar * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
    if (ev > 0)
      defenseFilters.push({
        id: 'defence.evasion',
        text: `Evasion: ${ev}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: ev,
        min: Math.floor(ev * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
    if (es > 0)
      defenseFilters.push({
        id: 'defence.energy_shield',
        text: `Energy Shield: ${es}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: es,
        min: Math.floor(es * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
    if (defenses.ward > 0)
      defenseFilters.push({
        id: 'defence.ward',
        text: `Ward: ${defenses.ward}`,
        value: defenses.ward,
        min: Math.floor(defenses.ward * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
    if (defenses.block > 0)
      defenseFilters.push({
        id: 'defence.block',
        text: `Block: ${defenses.block}%`,
        value: defenses.block,
        min: Math.floor(defenses.block * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
  }

  // Add weapon DPS filters
  const weaponFilters: StatFilter[] = []
  if (itemInfo?.attacksPerSecond) {
    const aps = itemInfo.attacksPerSecond
    // Normalize physical damage to 20% quality
    const physAvg =
      itemInfo.physDamageMin != null && itemInfo.physDamageMax != null
        ? ((itemInfo.physDamageMin + itemInfo.physDamageMax) / 2) * qualityNorm
        : 0
    const eleAvg = itemInfo.eleDamageAvg ?? 0
    const chaosAvg = itemInfo.chaosDamageAvg ?? 0
    const pdps = Math.round(physAvg * aps * 10) / 10
    const edps = Math.round(eleAvg * aps * 10) / 10
    const cdps = Math.round(chaosAvg * aps * 10) / 10
    const totalDps = Math.round((physAvg + eleAvg + chaosAvg) * aps * 10) / 10

    if (pdps > 0)
      weaponFilters.push({
        id: 'weapon.pdps',
        text: `Physical DPS: ${pdps}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: pdps,
        min: Math.floor(pdps * pct),
        max: null,
        enabled: true,
        type: 'weapon',
      })
    if (edps > 0)
      weaponFilters.push({
        id: 'weapon.edps',
        text: `Elemental DPS: ${edps}`,
        value: edps,
        min: Math.floor(edps * pct),
        max: null,
        enabled: true,
        type: 'weapon',
      })
    if (cdps > 0)
      weaponFilters.push({
        id: 'weapon.cdps',
        text: `Chaos DPS: ${cdps}`,
        value: cdps,
        min: Math.floor(cdps * pct),
        max: null,
        enabled: false,
        type: 'weapon',
      })
    if (totalDps > 0)
      weaponFilters.push({
        id: 'weapon.dps',
        text: `Total DPS: ${totalDps}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: totalDps,
        min: Math.floor(totalDps * pct),
        max: null,
        enabled: false,
        type: 'weapon',
      })
  }

  // Add socket/link/quality/ilvl filters
  const miscFilters: StatFilter[] = []
  if (itemInfo) {
    // Parse socket colors
    const socketStr = itemInfo.sockets.replace(/[-\s]/g, '')
    const r = (socketStr.match(/R/g) ?? []).length
    const g = (socketStr.match(/G/g) ?? []).length
    const b = (socketStr.match(/B/g) ?? []).length
    const w = (socketStr.match(/W/g) ?? []).length
    const a = (socketStr.match(/A/g) ?? []).length
    const totalSockets = r + g + b + w + a

    // Only show sockets chip for: white sockets, 6 sockets, or abyssal sockets
    if (w > 0) {
      filters.push({
        id: 'socket.white_sockets',
        text: 'White Sockets',
        value: w,
        min: w,
        max: null,
        enabled: false,
        type: 'explicit',
      })
    }
    if (a > 0) {
      const abyssIsImplicit =
        !advancedMods ||
        advancedMods.some((am) => am.type === 'implicit' && am.lines.some((l) => /Abyssal Socket/i.test(l)))
      miscFilters.push({
        id: `${abyssIsImplicit ? 'implicit' : 'explicit'}.stat_3527617737`,
        text: 'Abyssal Sockets',
        value: a,
        min: a,
        max: null,
        enabled: true,
        type: abyssIsImplicit ? 'implicit' : 'explicit',
      })
    }
    if (itemInfo.linkedSockets >= 5) {
      miscFilters.push({
        id: 'socket.links',
        text: `${itemInfo.linkedSockets}L`,
        value: itemInfo.linkedSockets,
        min: itemInfo.linkedSockets,
        max: null,
        enabled: true,
        type: 'socket',
      })
    }
    const isBaseItem = itemInfo.rarity === 'Normal' || itemInfo.rarity === 'Magic'
    const isOverqualitied = itemInfo.quality > 20
    if (itemInfo.baseType && itemInfo.rarity !== 'Unique' && !isGemItem) {
      // baseType is already cleaned by the clipboard parser (Superior stripped, magic affixes removed if base was recognized)
      // Special map types that have their own trade API type (not generic "Map")
      const specialMapTypes = new Set(['Nightmare Map', 'Valdo Map', 'Shaper Guardian Map', 'Vaal Temple Map'])
      const baseTypeCleaned = itemInfo.baseType
        .replace(/^Superior\s+/i, '')
        .replace(/\s*\(Tier \d+\)/, '')
        .trim()
      const isSpecialMap = itemInfo.itemClass === 'Maps' && specialMapTypes.has(baseTypeCleaned)
      const baseTypeEnabled = isSpecialMap || (isBaseItem && isOverqualitied)
      miscFilters.push({
        id: 'misc.basetype',
        text: itemInfo.baseType
          .replace(/^Superior\s+/i, '')
          .replace(/\s*\(Tier \d+\)/, '')
          .trim(),
        value: null,
        min: null,
        max: null,
        enabled: baseTypeEnabled,
        type: 'misc',
      })
    }
    const isGem = ['Gems', 'Support Gems', 'Skill Gems', 'Active Skill Gems', 'Support Skill Gems'].includes(
      itemInfo.itemClass,
    )
    if (isGem && itemInfo.gemLevel > 0) {
      // Gem level as adjustable row with exact min/max
      miscFilters.push({
        id: 'misc.gem_level',
        text: `Gem Level: ${itemInfo.gemLevel}`,
        value: itemInfo.gemLevel,
        min: itemInfo.gemLevel,
        max: null,
        enabled: true,
        type: 'gem',
      })
    }
    if (isGem) {
      miscFilters.push({
        id: 'misc.gem_transfigured',
        text: 'Transfigured',
        value: null,
        min: null,
        max: null,
        enabled: !!itemInfo.transfigured,
        type: 'gem',
      })
    }
    if (itemInfo.quality > 0) {
      if (isGem) {
        miscFilters.push({
          id: 'misc.quality',
          text: `Quality: ${itemInfo.quality}%`,
          value: itemInfo.quality,
          min: itemInfo.quality,
          max: null,
          enabled: itemInfo.quality >= 20,
          type: 'gem',
        })
      } else {
        const qualityEnabled = isBaseItem && isOverqualitied
        miscFilters.push({
          id: 'misc.quality',
          text: `Quality: ${itemInfo.quality}%`,
          value: itemInfo.quality,
          min: itemInfo.quality,
          max: null,
          enabled: qualityEnabled,
          type: 'misc',
        })
      }
    }
    if (itemInfo.itemLevel > 0) {
      miscFilters.push({
        id: 'misc.ilvl',
        text: `ilvl: ${itemInfo.itemLevel}`,
        value: itemInfo.itemLevel,
        min: itemInfo.itemLevel,
        max: null,
        enabled: false,
        type: 'misc',
      })
    }
    // Open prefix/suffix chips (from advanced mod data, non-uniques only)
    if (advancedMods && advancedMods.length > 0 && itemInfo.rarity !== 'Unique') {
      const prefixCount = advancedMods.filter((m) => m.type === 'prefix').length
      const suffixCount = advancedMods.filter((m) => m.type === 'suffix').length
      // Max affixes depends on item: normal equipment has 3/3, jewels have 2/2
      const isJewel = itemInfo.itemClass === 'Jewels' || itemInfo.itemClass === 'Abyss Jewels'
      const maxPrefixes = isJewel ? 2 : 3
      const maxSuffixes = isJewel ? 2 : 3
      const openPrefixes = maxPrefixes - prefixCount
      const openSuffixes = maxSuffixes - suffixCount
      if (openPrefixes > 0) {
        miscFilters.push({
          id: 'pseudo.pseudo_number_of_empty_prefix_mods',
          text: `Open Prefix (${openPrefixes})`,
          value: openPrefixes,
          min: 1,
          max: null,
          enabled: false,
          type: 'misc',
        })
      }
      if (openSuffixes > 0) {
        miscFilters.push({
          id: 'pseudo.pseudo_number_of_empty_suffix_mods',
          text: `Open Suffix (${openSuffixes})`,
          value: openSuffixes,
          min: 1,
          max: null,
          enabled: false,
          type: 'misc',
        })
      }
    }

    // Memory Strands
    if (itemInfo.memoryStrands != null) {
      defenseFilters.push({
        id: 'misc.memory_level',
        text: `Memory Strands: ${itemInfo.memoryStrands}`,
        value: itemInfo.memoryStrands,
        min: itemInfo.memoryStrands,
        max: null,
        enabled: true,
        type: 'pseudo',
      })
    }

    // 8-mod corrupted maps (4 prefix + 4 suffix)
    if (itemInfo.itemClass === 'Maps' && advancedMods && advancedMods.length > 0) {
      const prefixCount = advancedMods.filter((m) => m.type === 'prefix').length
      const suffixCount = advancedMods.filter((m) => m.type === 'suffix').length
      if (prefixCount >= 4 && suffixCount >= 4) {
        miscFilters.push({
          id: 'pseudo.pseudo_number_of_affix_mods',
          text: '8 Mods',
          value: 8,
          min: 8,
          max: null,
          enabled: true,
          type: 'misc',
        })
      }
    }

    // Equipment and gems: always show corrupted chip (on if item is corrupted, off if not)
    const isEquipment = !!ITEM_CLASS_TO_CATEGORY[itemInfo.itemClass]
    const isMap = itemInfo.itemClass === 'Maps'
    if (isGem || isEquipment || isMap) {
      miscFilters.push({
        id: 'misc.corrupted',
        text: 'Corrupted',
        value: null,
        min: null,
        max: null,
        enabled: !!itemInfo.corrupted,
        type: 'misc',
      })
    } else if (itemInfo.corrupted && itemInfo.itemClass !== 'Divination Cards') {
      miscFilters.push({
        id: 'misc.corrupted',
        text: 'Corrupted',
        value: null,
        min: null,
        max: null,
        enabled: true,
        type: 'misc',
      })
    }
    // Rarity filter for equipment (off by default - search includes all non-unique by default)
    if (isEquipment && itemInfo.rarity !== 'Unique') {
      miscFilters.push({
        id: 'misc.rarity',
        text: itemInfo.rarity,
        value: null,
        min: null,
        max: null,
        enabled: false,
        type: 'misc',
      })
    }
    if (itemInfo.mirrored) {
      miscFilters.push({
        id: 'misc.mirrored',
        text: 'Mirrored',
        value: null,
        min: null,
        max: null,
        enabled: true,
        type: 'misc',
      })
    }
    if (itemInfo.identified === false) {
      miscFilters.push({
        id: 'misc.identified',
        text: 'Unidentified',
        value: null,
        min: null,
        max: null,
        enabled: true,
        type: 'misc',
      })
    }

    // Fractured chip for equipment: off = exclude fractured, on = include fractured
    // Auto-enable if any fractured mod filter is enabled
    if (isEquipment && itemInfo.rarity !== 'Unique') {
      const hasFracturedMod = filters.some((f) => f.type === 'fractured' && f.enabled)
      miscFilters.push({
        id: 'misc.fractured',
        text: 'Include Fractured',
        value: null,
        min: null,
        max: null,
        enabled: hasFracturedMod,
        type: 'misc',
      })
    }

    // Influence chips (skip for maps -- map influences use implicit stats, not misc_filters)
    if (itemInfo.influence && itemInfo.influence.length > 0 && itemInfo.itemClass !== 'Maps') {
      const defaultOn = new Set(['Elder', 'Shaper', 'Crusader', 'Redeemer', 'Hunter', 'Warlord'])
      for (const inf of itemInfo.influence) {
        miscFilters.push({
          id: `misc.influence_${inf.toLowerCase().replace(/\s+/g, '_')}`,
          text: inf,
          value: null,
          min: null,
          max: null,
          enabled: defaultOn.has(inf),
          type: 'misc',
        })
      }
    }
  }

  // Area level chip (for heist contracts/blueprints)
  if (itemInfo?.monsterLevel && itemInfo.itemClass !== 'Maps') {
    miscFilters.push({
      id: 'misc.area_level',
      text: `Area Level: ${itemInfo.monsterLevel}`,
      value: itemInfo.monsterLevel,
      min: itemInfo.monsterLevel,
      max: null,
      enabled: true,
      type: 'misc',
    })
  }

  // Heist blueprint wings revealed
  if (itemInfo?.wingsRevealed != null) {
    miscFilters.push({
      id: 'heist.wings_revealed',
      text: `Wings Revealed: ${itemInfo.wingsRevealed}`,
      value: itemInfo.wingsRevealed,
      min: itemInfo.wingsRevealed,
      max: null,
      enabled: true,
      type: 'heist',
    })
    if (itemInfo.wingsTotal) {
      miscFilters.push({
        id: 'heist.max_wings',
        text: `Total Wings: ${itemInfo.wingsTotal}`,
        value: itemInfo.wingsTotal,
        min: itemInfo.wingsTotal,
        max: null,
        enabled: true,
        type: 'heist',
      })
    }
  }

  // Facetor's Lens stored experience
  if (itemInfo?.storedExperience != null) {
    const expStr = itemInfo.storedExperience.toLocaleString()
    filters.push({
      id: 'misc.stored_experience',
      text: `Stored Experience: ${expStr}`,
      value: itemInfo.storedExperience,
      min: itemInfo.storedExperience,
      max: null,
      enabled: true,
      type: 'currency',
    })
  }

  // Logbook faction and boss chips
  if (itemInfo?.logbookFactions && itemInfo.logbookFactions.length > 0) {
    const factionLabels: Record<string, string> = {
      knights: 'Knights of the Sun',
      mercenaries: 'Black Scythe Mercenaries',
      order: 'Order of the Chalice',
      druids: 'Druids of the Broken Circle',
    }
    for (const faction of itemInfo.logbookFactions) {
      filters.push({
        id: `pseudo.pseudo_logbook_faction_${faction}`,
        text: factionLabels[faction] ?? faction,
        value: null,
        min: null,
        max: null,
        enabled: true,
        type: 'pseudo',
      })
    }
  }
  if (itemInfo?.logbookBosses && itemInfo.logbookBosses.length > 0) {
    const bossOptions: Record<string, number> = {
      'Medved, Feller of Heroes': 1,
      'Vorana, Last to Fall': 2,
      'Uhtred, Covetous Traitor': 3,
      'Olroth, Origin of the Fall': 4,
    }
    for (const boss of itemInfo.logbookBosses) {
      const optionId = bossOptions[boss]
      if (optionId) {
        filters.push({
          id: 'implicit.stat_3159649981',
          text: boss,
          value: null,
          min: null,
          max: null,
          enabled: true,
          type: 'implicit',
          option: optionId,
        })
      }
    }
  }

  // Chronicle of Atzoatl room chips
  if (itemInfo?.atzoatlRooms && itemInfo.atzoatlRooms.length > 0) {
    const openCount = itemInfo.atzoatlOpenCount ?? itemInfo.atzoatlRooms.length
    itemInfo.atzoatlRooms.forEach((room, i) => {
      const statId = ATZOATL_ROOMS[room]
      if (!statId) return
      const isOpen = i < openCount
      const isKey = ATZOATL_KEY_ROOMS.has(room)
      const label = isOpen ? `Open Room: ${room}` : `Obstructed: ${room}`
      filters.push({
        id: statId,
        text: label,
        value: null,
        min: null,
        max: null,
        enabled: isOpen && isKey,
        type: isKey ? 'temple-key' : 'temple',
        option: isOpen ? 1 : 2,
      })
    })
  }

  // Map property chips (Item Quantity, Rarity, Pack Size, More X)
  const mapFilters: StatFilter[] = []
  if (itemInfo && itemInfo.itemClass === 'Maps' && itemInfo.rarity === 'Rare') {
    const mapMin = (v: number) => Math.floor(v * 0.9)
    if (itemInfo.mapQuantity)
      mapFilters.push({
        id: 'map.map_iiq',
        text: `Quantity: +${itemInfo.mapQuantity}%`,
        value: itemInfo.mapQuantity,
        min: mapMin(itemInfo.mapQuantity),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapRarity)
      mapFilters.push({
        id: 'map.map_iir',
        text: `Rarity: +${itemInfo.mapRarity}%`,
        value: itemInfo.mapRarity,
        min: mapMin(itemInfo.mapRarity),
        max: null,
        enabled: false,
        type: 'map',
      })
    if (itemInfo.mapPackSize)
      mapFilters.push({
        id: 'map.map_packsize',
        text: `Pack Size: +${itemInfo.mapPackSize}%`,
        value: itemInfo.mapPackSize,
        min: mapMin(itemInfo.mapPackSize),
        max: null,
        enabled: true,
        type: 'map',
      })
    // More Scarabs/Currency/Maps/Div Cards are pseudo stats
    if (itemInfo.mapMoreScarabs)
      mapFilters.push({
        id: 'pseudo.pseudo_map_more_scarab_drops',
        text: `More Scarabs: +${itemInfo.mapMoreScarabs}%`,
        value: itemInfo.mapMoreScarabs,
        min: mapMin(itemInfo.mapMoreScarabs),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapMoreCurrency)
      mapFilters.push({
        id: 'pseudo.pseudo_map_more_currency_drops',
        text: `More Currency: +${itemInfo.mapMoreCurrency}%`,
        value: itemInfo.mapMoreCurrency,
        min: mapMin(itemInfo.mapMoreCurrency),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapMoreMaps)
      mapFilters.push({
        id: 'pseudo.pseudo_map_more_map_drops',
        text: `More Maps: +${itemInfo.mapMoreMaps}%`,
        value: itemInfo.mapMoreMaps,
        min: mapMin(itemInfo.mapMoreMaps),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapMoreDivCards)
      mapFilters.push({
        id: 'pseudo.pseudo_map_more_card_drops',
        text: `More Div Cards: +${itemInfo.mapMoreDivCards}%`,
        value: itemInfo.mapMoreDivCards,
        min: mapMin(itemInfo.mapMoreDivCards),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapReward)
      mapFilters.push({
        id: 'map.map_completion_reward',
        text: `Reward: ${itemInfo.mapReward}`,
        value: null,
        min: null,
        max: null,
        enabled: true,
        type: 'map',
        option: itemInfo.mapReward,
      })
  }

  // Timeless jewel handling: two toggleable chips - "Any Leader" and specific leader
  const timelessFilters: StatFilter[] = []
  if (itemInfo?.baseType === 'Timeless Jewel') {
    let seed: number | null = null
    let currentLeader: string | null = null
    let allLeaders: string[] = []

    if (advancedMods) {
      // Advanced mod format (Ctrl+Alt+C): "Carved to glorify 5972(2000-10000) new faithful converted by High Templar Dominus(Avarius-Maxarius)"
      const timelessMod = advancedMods.find((am) => am.lines.some((l) => /Passives in radius are Conquered/i.test(l)))
      if (timelessMod) {
        const leaderLine = timelessMod.lines.find((l) => /\d/.test(l))
        if (leaderLine) {
          const seedMatch = leaderLine.match(/(\d+)\(\d+-\d+\)/)
          seed = seedMatch ? parseInt(seedMatch[1]) : null
          const leaderMatch = leaderLine.match(/(\w+)\(([^)]+)\)\s*$/)
          if (leaderMatch) {
            currentLeader = leaderMatch[1]
            const alternatives = leaderMatch[2].split('-')
            allLeaders = [...new Set([currentLeader, ...alternatives])]
          }
        }
      }
    }

    if (!seed) {
      // Plain text format (Ctrl+C): "Remembrancing 2724 songworthy deeds by the line of Medved"
      const remembrancingLine = explicits.find((l) => /^Remembrancing/i.test(l))
      if (remembrancingLine) {
        const seedMatch = remembrancingLine.match(/Remembrancing (\d+)/)
        seed = seedMatch ? parseInt(seedMatch[1]) : null
        const leaderMatch = remembrancingLine.match(/by the line of (\w+)/i)
        if (leaderMatch) {
          currentLeader = leaderMatch[1]
          allLeaders = ['Medved', 'Vorana', 'Uhtred']
        }
      }
    }

    if (!seed) {
      // Plain text format for other timeless jewels: "Bathed 7421 tips of fingers and toes in the Precursor's blood by Doryani"
      const seedLine = explicits.find((l) => /Commanded|Commissioned|Carved|Bathed|Denoted/i.test(l))
      if (seedLine) {
        const seedMatch = seedLine.match(/\b(\d{4,5})\b/)
        seed = seedMatch ? parseInt(seedMatch[1]) : null
        const leaderMatch = seedLine.match(/by (?:High Templar |Victorious |)(\w+)\s*$/i)
        if (leaderMatch) {
          currentLeader = leaderMatch[1]
          // Determine alternatives based on known timeless jewel families
          const timelessFamilies: Record<string, string[]> = {
            Dominus: ['Dominus', 'Avarius', 'Maxarius'],
            Avarius: ['Dominus', 'Avarius', 'Maxarius'],
            Maxarius: ['Dominus', 'Avarius', 'Maxarius'],
            Doryani: ['Doryani', 'Xibaqua', 'Ahuana'],
            Xibaqua: ['Doryani', 'Xibaqua', 'Ahuana'],
            Ahuana: ['Doryani', 'Xibaqua', 'Ahuana'],
            Asenath: ['Asenath', 'Balbala', 'Nasima'],
            Balbala: ['Asenath', 'Balbala', 'Nasima'],
            Nasima: ['Asenath', 'Balbala', 'Nasima'],
            Cadiro: ['Cadiro', 'Victario', 'Caspiro'],
            Victario: ['Cadiro', 'Victario', 'Caspiro'],
            Caspiro: ['Cadiro', 'Victario', 'Caspiro'],
            Kaom: ['Kaom', 'Rakiata', 'Kiloava'],
            Rakiata: ['Kaom', 'Rakiata', 'Kiloava'],
            Kiloava: ['Kaom', 'Rakiata', 'Kiloava'],
          }
          allLeaders = timelessFamilies[currentLeader] ?? [currentLeader]
        }
      }
    }

    if (seed && currentLeader && allLeaders.length > 0) {
      const allStatIds = allLeaders.map((l) => `explicit.pseudo_timeless_jewel_${l.toLowerCase()}`)
      const currentStatId = `explicit.pseudo_timeless_jewel_${currentLeader.toLowerCase()}`

      // "Any Leader" chip (default on) - uses count group with all leaders
      timelessFilters.push({
        id: 'timeless-any',
        text: `${seed} Any Leader`,
        value: seed,
        min: seed,
        max: seed,
        enabled: true,
        type: 'timeless',
        timelessLeaders: allStatIds,
      })
      // Specific leader chip (default off) - searches only this leader
      timelessFilters.push({
        id: currentStatId,
        text: `${seed} ${currentLeader}`,
        value: seed,
        min: seed,
        max: seed,
        enabled: false,
        type: 'timeless',
      })
    }
  }

  return [
    ...weaponFilters,
    ...defenseFilters,
    ...pseudoFilters,
    ...timelessFilters,
    ...imbueFilters,
    ...enchantFilters,
    ...mapFilters,
    ...miscFilters,
    ...filters,
  ]
}
