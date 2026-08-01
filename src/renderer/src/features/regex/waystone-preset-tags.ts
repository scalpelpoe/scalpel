import type { WaystoneMod } from '@shared/data/regex/waystone-mods'
import { WAYSTONE_MODS } from '@shared/data/regex/waystone-mods'
import type { RegexPresetTag } from '@shared/types'
import { TAB_COLORS } from './mapmods-helpers'

/** Hand-curated short tag names per waystone mod, keyed by the unique regex token
 *  each mod carries. Used for save-preset auto-tags so the preset card shows readable
 *  chips like "+mob-speed" / "-max-res" instead of the full mod text. Add new mods
 *  here as they ship; unmapped mods fall back to a truncated text slice. */
const TAG_BY_REGEX_TOKEN: Record<string, string> = {
  // ---- Suffixes (avoid / bad mods) -----------------------------------------
  tta: '+mob-speed', // Monster Attack/Movement/Cast Speed | Pack size
  '% ma': '-max-res', // ##% maximum Player Resistances | Pack size
  blee: 'magic-bleed', // Magic Monsters | Bleeding on Hit
  lm: 'magic-thresh', // Magic Monsters | Ailment + Stun Threshold
  'un b': 'magic-stun', // Magic Monsters | Stun Buildup
  eq: 'rare-break', // Rare Monsters | Break Armour
  tak: 'rare-crit-redux', // Rare Monsters | reduced Extra Damage from Crit
  mod: 'rare-mod', // Rare Monsters | additional Modifier
  'r el': 'mob-ele-res', // +##% Monster Elemental Resistances | Rarity
  tes: 'ele-pen', // Monster Damage Penetrates ele resists
  oj: '+proj', // Monsters fire # additional Projectiles
  ois: '+poison', // chance to Poison on Hit
  cc: '+accuracy', // increased Accuracy Rating
  bon: '+crit', // Critical Hit Chance + Critical Damage Bonus
  ect$: '+aoe', // Monsters have #% increased Area of Effect
  mm: 'ailment-buildup', // Freeze + Shock + Flammability
  sk: '-flask', // reduced Flask Charges
  wn: '-cooldown', // less Cooldown Recovery
  'f l': '-recovery', // less Recovery Rate of Life and ES

  // ---- Prefixes (want / good mods) -----------------------------------------
  rses: 'less-curse', // less effect of Curses on Monsters | Rarity
  ign: 'magic-ignite', // Magic Monsters | Ignited Ground
  fire$: 'magic-fire', // Magic Monsters | Extra Fire
  eble: 'magic-enf', // Magic Monsters | Enfeeble
  mage$: 'rare-dmg', // Rare Monsters | Monster Damage
  fe$: 'rare-life', // Rare Monsters | more Monster Life
  oure: 'rare-armour', // Rare Monsters | Armoured
  sts: 'pack-beasts',
  'f br': 'pack-bramble',
  yt: 'pack-ezomyte',
  'un m': 'pack-faridun',
  ds: 'pack-iron-guards',
  agu: 'pack-plagued',
  ans: 'pack-transcended',
  ndea: 'pack-undead',
  aa: 'pack-vaal',
  chi: 'chilled-ground',
  cke: 'shocked-ground',
  'e eva': 'evasive', // Monsters are Evasive | Pack size
  'ra ch': '+chaos', // Extra Chaos
  col: '+cold', // Extra Cold
  tn: '+light', // Extra Lightning
  'f m': '+mob-es', // maximum Life as Extra maximum Energy Shield
  'r,': 'charge-steal', // chance to steal Power, Frenzy, Endurance
  kn: 'ele-weak', // Players are periodically Cursed with Elemental Weakness
  emp: 'temp-chains', // Players are periodically Cursed with Temporal Chains
}

/** Resolve a mod to its short tag, with truncated-text fallback for any mod we
 *  haven't curated yet. */
export function getWaystoneModTag(mod: WaystoneMod): string {
  if (TAG_BY_REGEX_TOKEN[mod.regex]) return TAG_BY_REGEX_TOKEN[mod.regex]
  return mod.text.split('|')[0].replace(/#%?/g, '').trim().toLowerCase().slice(0, 20)
}

interface PresetTagState {
  want: Set<number>
  avoid: Set<number>
  tier: { min: number; max: number }
  corruption: { corrupted: boolean; uncorrupted: boolean }
  rarityFilter: { normal: boolean; magic: boolean; rare: boolean }
  revives: { min: number; max: number }
  delirious: boolean
  anyPack: boolean
  /** "Quantity & yield" thresholds (0/null = unset). */
  quantities: {
    packSize: number | null
    monsterEffectiveness: number | null
    monsterRarity: number | null
    itemRarity: number | null
    dropChance: number | null
  }
  wantValues: Record<number, number>
  avoidValues: Record<number, number>
}

/** Short chip label per quantity field. */
const QUANTITY_TAG_LABELS: Array<[keyof PresetTagState['quantities'], string]> = [
  ['packSize', 'pack'],
  ['monsterEffectiveness', 'effect'],
  ['monsterRarity', 'mon-rar'],
  ['itemRarity', 'iir'],
  ['dropChance', 'drop'],
]

/** Generate the auto-tag list for a waystone preset, mirroring the maps generator's
 *  pattern: one tag per selected mod plus per-qualifier tags. Tags carry a `source`
 *  so the container can distinguish them from user-added custom tags. */
export function generateWaystonePresetTags(state: PresetTagState): RegexPresetTag[] {
  const tags: RegexPresetTag[] = []

  // Tier tag -- only when narrower than the full 1-16 default span.
  if (state.tier.min > 1 || state.tier.max < 16) {
    const lo = Math.max(1, state.tier.min)
    const hi = Math.min(16, state.tier.max)
    tags.push({
      text: lo === hi ? `T${lo}` : `T${lo}-${hi}`,
      color: TAB_COLORS.qualifiers,
      source: 'qualifier',
      sourceId: 'tier',
    })
  }

  if (state.corruption.corrupted && !state.corruption.uncorrupted) {
    tags.push({ text: 'corr', color: TAB_COLORS.qualifiers, source: 'qualifier', sourceId: 'corrupted' })
  } else if (state.corruption.uncorrupted && !state.corruption.corrupted) {
    tags.push({ text: '!corr', color: TAB_COLORS.qualifiers, source: 'qualifier', sourceId: 'uncorrupted' })
  }

  if (state.rarityFilter.normal) {
    tags.push({ text: 'Normal', color: TAB_COLORS.qualifiers, source: 'qualifier', sourceId: 'rarityNormal' })
  }
  if (state.rarityFilter.magic) {
    tags.push({ text: 'Magic', color: TAB_COLORS.qualifiers, source: 'qualifier', sourceId: 'rarityMagic' })
  }
  if (state.rarityFilter.rare) {
    tags.push({ text: 'Rare', color: TAB_COLORS.qualifiers, source: 'qualifier', sourceId: 'rarityRare' })
  }
  if (state.revives.min > 0 || state.revives.max < 6) {
    tags.push({
      text: `revives ${state.revives.min}-${state.revives.max}`,
      color: TAB_COLORS.qualifiers,
      source: 'qualifier',
      sourceId: 'revives',
    })
  }

  for (const [key, label] of QUANTITY_TAG_LABELS) {
    const value = state.quantities[key]
    if (value && value > 0) {
      tags.push({
        text: `${label}>=${value}`,
        color: TAB_COLORS.qualifiers,
        source: 'qualifier',
        sourceId: key,
      })
    }
  }
  if (state.delirious) {
    tags.push({ text: 'delir', color: TAB_COLORS.qualifiers, source: 'qualifier', sourceId: 'delirious' })
  }
  if (state.anyPack) {
    tags.push({ text: '+pack', color: TAB_COLORS.qualifiers, source: 'qualifier', sourceId: 'anyPack' })
  }

  // Avoid (suffix) tags
  for (const id of state.avoid) {
    const mod = WAYSTONE_MODS.find((m) => m.id === id)
    if (!mod) continue
    const v = state.avoidValues[id]
    const text = v ? `${getWaystoneModTag(mod)}>=${v}` : getWaystoneModTag(mod)
    tags.push({ text, color: TAB_COLORS.avoid, source: 'avoid', sourceId: id })
  }

  // Want (prefix) tags
  for (const id of state.want) {
    const mod = WAYSTONE_MODS.find((m) => m.id === id)
    if (!mod) continue
    const v = state.wantValues[id]
    const text = v ? `${getWaystoneModTag(mod)}>=${v}` : getWaystoneModTag(mod)
    tags.push({ text, color: TAB_COLORS.want, source: 'want', sourceId: id })
  }

  return tags
}
