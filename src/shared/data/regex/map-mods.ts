import { regexMapModsENGLISH } from './vendor/mapmods/Generated.MapModsV3.ENGLISH'
import type { Regex, MapModsTokenOption } from './vendor/mapmods/GeneratedTypes'

export type Danger = 'lethal' | 'dangerous' | 'annoying' | 'mild' | 'harmless' | 'beneficial'

export interface MapMod {
  id: number
  regex: string
  text: string
  danger: Danger
  nightmare: boolean
}

/** Override danger level for specific mods by ID */
const DANGER_OVERRIDES: Record<number, Danger> = {
  [955801458]: 'beneficial', // Area contains two Unique Bosses
  [-1647756153]: 'beneficial', // Rare Monsters each have 1 additional Modifier|increased number of Rare Monsters
  // 3.29 rates both Thorns rolls scary: 0, which would file reflect damage under
  // "Beneficial" alongside extra-magic-monsters. Harmless is the honest floor.
  [-235013251]: 'harmless', // Rare Monsters have Physical Thorns reflecting (400-800) Physical Damage
  [1078205993]: 'harmless', // Rare Monsters have Elemental Thorns reflecting (900-1500) Elemental Damage
}

/** Mods that are nightmare but should be grouped with regular mods (not in the nightmare section) */
export const NIGHTMARE_REGROUPED: Set<number> = new Set([
  -1647756153, // Rare Monsters each have 1 additional Modifier|increased number of Rare Monsters
])

function scaryToDanger(scary: number): Danger {
  if (scary >= 600) return 'lethal'
  if (scary >= 370) return 'dangerous'
  if (scary >= 85) return 'annoying'
  if (scary >= 10) return 'mild'
  if (scary >= 2) return 'harmless'
  return 'beneficial'
}

/** Strip GGG's tag markup: `[Internal|Display]` renders in-game as `Display`, `[Word]`
 *  as `Word`. 3.29's Thorns map mods ship the raw tag form upstream, and the `|` inside
 *  the brackets would otherwise read as this data's multi-mod separator -- breaking both
 *  the label and the trade lookup, which splits mod text on `|` before matching stats. */
function stripTags(rawText: string): string {
  return rawText.replace(/\[[^\]|]*\|([^\]]*)\]/g, '$1').replace(/\[([^\]]*)\]/g, '$1')
}

function formatText(rawText: string): string {
  return stripTags(rawText)
    .replace(/\([\d-]+\)/g, '#')
    .replace(/\b\d+%/g, '#%')
    .replace(/\b\d+\b/g, '#')
}

function tokensToMods(data: Regex<MapModsTokenOption>): MapMod[] {
  return data.tokens.map((t) => ({
    id: t.id,
    regex: t.regex,
    text: formatText(t.rawText),
    danger: DANGER_OVERRIDES[t.id] ?? scaryToDanger(t.options.scary),
    nightmare: t.options.nm,
  }))
}

export const MAP_MODS: MapMod[] = tokensToMods(regexMapModsENGLISH)

export const MAP_MOD_OPTIMIZATIONS = regexMapModsENGLISH.optimizationTable

export const DANGER_COLORS: Record<Danger, string> = {
  lethal: '#ef5350',
  dangerous: '#ff9800',
  annoying: '#ffd54f',
  mild: '#81c784',
  harmless: '#90a4ae',
  beneficial: '#4fc3f7',
}

export const DANGER_LABELS: Record<Danger, string> = {
  lethal: 'Lethal',
  dangerous: 'Dangerous',
  annoying: 'Annoying',
  mild: 'Mild',
  harmless: 'Harmless',
  beneficial: 'Beneficial',
}
