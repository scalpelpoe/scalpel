import type { FilterAction, FilterBlock, FilterFile } from '@shared/types'
import type { FilterSection, FilterSectionTier } from '@shared/contracts/filter-sections'

export type { FilterSection, FilterSectionTier }

const TYPE_TITLES: Record<string, string> = {
  currency: 'Currency',
  'currency->emotions': 'Emotions (Delirium)',
  'currency->leveling': 'Campaign currency',
  gold: 'Gold',
  uniques: 'Uniques',
  gems: 'Gems',
  'gems-': 'Gems (extra)',
  fragments: 'Fragments',
  'fragments-': 'Fragments (extra)',
  waystones: 'Waystones',
  'waystone-': 'Waystones (extra)',
  jewels: 'Jewels',
  'jewels-': 'Jewels (extra)',
  exoticbases: 'Exotic bases',
  exoticmods: 'Exotic mods',
  artifact: 'Artifacts',
  relics: 'Relics',
  verisium: 'Verisium',
  chancing: 'Chancing',
  leveling: 'Leveling',
  'leveling-': 'Leveling (extra)',
  rare: 'Rares',
  'rare-': 'Rares (extra)',
  sockets: 'Sockets',
  'sockets-': 'Sockets (extra)',
  maplike: 'Map-like',
  'maplike-': 'Map-like (extra)',
  endgame: 'Endgame',
  'endgame-': 'Endgame (extra)',
  special: 'Special',
  'special-': 'Special (extra)',
  anyremaining: 'Any remaining',
  hidelayer: 'Hide layer',
  conditionalhide: 'Conditional hide',
  questlikeexception: 'Quest exceptions',
  miscmapitemsextra: 'Misc map items',
  xenotiering: 'Xeno tiering',
  legacytemp: 'Legacy / temp',
  decorators: 'Decorators',
  'decorators-': 'Decorators (extra)',
  rr: 'RR',
  'rr-': 'RR (extra)',
  ut: 'UT',
}

const TIER_ORDER = ['s', 'a', 'b', 'c', 'd', 'e', 'f', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10']

function titleForTypePath(typePath: string): string {
  if (TYPE_TITLES[typePath]) return TYPE_TITLES[typePath]
  const leaf = typePath.split('->').pop() ?? typePath
  return leaf.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function labelForTier(tier: string): string {
  const t = tier.toLowerCase()
  if (/^[a-z]$/.test(t)) return `${t.toUpperCase()} tier`
  if (t.startsWith('supply')) return `Supplies: ${tier.replace(/^supplies?/i, '').replace(/^[-_]?/, '') || 'general'}`
  if (t.includes('wisdom')) return 'Wisdom scrolls'
  if (t.includes('jeweller')) return "Jeweller's"
  return tier.replace(/[-_]+/g, ' ').toUpperCase()
}

function tierSortKey(tier: string): number {
  const t = tier.toLowerCase()
  const idx = TIER_ORDER.indexOf(t)
  if (idx >= 0) return idx
  if (t.startsWith('supply')) return 100 + t.length
  return 200
}

function rgbaFromAction(action: FilterAction | undefined, fallback: string): string {
  if (!action || action.values.length < 3) return fallback
  const [r, g, b] = action.values.map(Number)
  const a = action.values[3] != null ? Number(action.values[3]) / 255 : 1
  return `rgba(${r},${g},${b},${a})`
}

function previewActionsOf(block: FilterBlock): FilterAction[] {
  const keep = new Set(['SetTextColor', 'SetBorderColor', 'SetBackgroundColor', 'SetFontSize'])
  return block.actions.filter((a) => keep.has(a.type)).map((a) => ({ type: a.type, values: [...a.values] }))
}

function styleFromBlock(block: FilterBlock): { text: string; bg: string; border: string } {
  const byType = new Map(block.actions.map((a) => [a.type, a]))
  return {
    text: rgbaFromAction(byType.get('SetTextColor'), 'rgba(200,200,200,1)'),
    bg: rgbaFromAction(byType.get('SetBackgroundColor'), 'rgba(0,0,0,0.6)'),
    border: rgbaFromAction(byType.get('SetBorderColor'), 'transparent'),
  }
}

function baseTypesOf(block: FilterBlock): string[] {
  return block.conditions.filter((c) => c.type === 'BaseType').flatMap((c) => c.values)
}

/**
 * Group NeverSink-tagged blocks into FilterBlade-style sections.
 * Untagged / Continue-only decorator rows are skipped.
 */
export function buildFilterSections(filter: FilterFile): FilterSection[] {
  const byType = new Map<string, FilterSectionTier[]>()

  filter.blocks.forEach((block, blockIndex) => {
    const tag = block.tierTag
    if (!tag) return
    // Skip pure Continue decorator rows with no BaseType — they aren't tier lists.
    const baseTypes = baseTypesOf(block)
    if (block.continue && baseTypes.length === 0) return

    const tier: FilterSectionTier = {
      tier: tag.tier,
      label: labelForTier(tag.tier),
      blockIndex,
      visibility: block.visibility,
      previewLabel: baseTypes[0] ?? labelForTier(tag.tier),
      previewActions: previewActionsOf(block),
      style: styleFromBlock(block),
      baseTypes,
      itemCount: baseTypes.length,
    }
    const list = byType.get(tag.typePath) ?? []
    list.push(tier)
    byType.set(tag.typePath, list)
  })

  const sections: FilterSection[] = []
  for (const [typePath, tiers] of byType) {
    tiers.sort((a, b) => tierSortKey(a.tier) - tierSortKey(b.tier) || a.blockIndex - b.blockIndex)
    const shownCount = tiers.filter((t) => t.visibility === 'Show').length
    sections.push({
      typePath,
      title: titleForTypePath(typePath),
      tiers,
      shownCount,
      totalCount: tiers.length,
    })
  }

  // Prefer familiar NeverSink top-level groups first, then alpha.
  const PRIORITY = [
    'currency',
    'currency->emotions',
    'currency->leveling',
    'gold',
    'uniques',
    'fragments',
    'waystones',
    'gems',
    'jewels',
    'rare',
    'exoticbases',
  ]
  sections.sort((a, b) => {
    const ai = PRIORITY.indexOf(a.typePath)
    const bi = PRIORITY.indexOf(b.typePath)
    if (ai >= 0 || bi >= 0) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    return a.title.localeCompare(b.title)
  })

  return sections
}
