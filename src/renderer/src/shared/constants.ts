import divCardsData from '../../../shared/data/economy/div-cards.json'
import itemIconsPoe1 from '../../../shared/data/items/item-icons-poe1.json'
import itemIconsPoe2 from '../../../shared/data/items/item-icons-poe2.json'
import uniqueInfoPoe1 from '../../../shared/data/items/unique-info.json'
import uniqueInfoPoe2 from '../../../shared/data/items/unique-info-poe2.json'
import { getItemClasses } from '../../../shared/data/items/item-classes'

export { RARITY_COLORS } from '../../../shared/rarity-colors'

export const IP = {
  theme: 'two-tone' as const,
  fill: ['currentColor', 'rgba(255,255,255,0.2)'] as [string, string],
  style: { display: 'flex' },
}

/** GGG CDN art for the div-card inventory icon. Used by the title-bar Div Card
 *  Explorer button and the Show/Hide Tabs preview in View settings. Hosted on
 *  poecdn so the URL hash is stable as long as GGG doesn't rotate the asset. */
export const DIV_CARD_ICON_URL =
  'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvRGl2aW5hdGlvbi9JbnZlbnRvcnlJY29uIiwidyI6MSwiaCI6MSwic2NhbGUiOjF9XQ/f34bf8cbb5/InventoryIcon.png'

const ICONS_BY_VERSION: Record<1 | 2, Record<string, string>> = {
  1: itemIconsPoe1 as Record<string, string>,
  2: itemIconsPoe2 as Record<string, string>,
}

/** Shared item-icon lookup. Populated by initIconMap() once the renderer learns
 *  its PoE version via IPC. Consumers import this object and read `iconMap[name]`
 *  -- we mutate it in place so module references stay valid across the init. */
export const iconMap: Record<string, string> = {}

/** In-place replace -- preserves the target ref so importers stay attached. */
function replaceMap<T>(target: Record<string, T>, source: Record<string, T>): void {
  for (const k of Object.keys(target)) delete target[k]
  Object.assign(target, source)
}

export function initIconMap(version: 1 | 2): void {
  replaceMap(iconMap, ICONS_BY_VERSION[version])
}

/** Merge runtime-harvested icons (from main's icon-cache) into the shared
 *  iconMap. Called after initIconMap so bundled entries win -- cache entries
 *  only fill keys we didn't ship icons for. */
export function mergeIconCache(cache: Record<string, string>): void {
  for (const [k, v] of Object.entries(cache)) {
    if (!iconMap[k]) iconMap[k] = v
  }
}

const UNIQUES_BY_VERSION: Record<1 | 2, Record<string, string[]>> = {
  1: uniqueInfoPoe1 as Record<string, string[]>,
  2: uniqueInfoPoe2 as Record<string, string[]>,
}

/** baseType -> [unique names that drop on it]. Same shape and init pattern as
 *  iconMap; populated by initUniquesByBase() once poeVersion is known. */
export const uniquesByBase: Record<string, string[]> = {}

/** Replace uniquesByBase from a source map. Exported so tests can install
 *  fixtures without going through the per-version JSON loader. */
export function setUniquesByBase(source: Record<string, string[]>): void {
  replaceMap(uniquesByBase, source)
}

export function initUniquesByBase(version: 1 | 2): void {
  setUniquesByBase(UNIQUES_BY_VERSION[version])
}

/** baseType -> item-class lookup. Same init-on-version-known pattern as iconMap;
 *  populated by initItemClassMaps(). PoE1 and PoE2 share class names ("Body
 *  Armours" etc.) but enumerate different bases, so this MUST be rebuilt from
 *  the active game's class sheet to avoid PoE2 entries shadowing PoE1 bases
 *  (or vice versa). */
export const baseToClass: Record<string, string> = {}

/** Item-class -> [width, height] inventory size. Populated by initItemClassMaps()
 *  alongside baseToClass. Sizes are mostly stable across games but some PoE2
 *  classes redefine the slot footprint, so this dispatches on version too. */
export const classSizes: Record<string, [number, number]> = {}

export function initItemClassMaps(version: 1 | 2): void {
  const classes = getItemClasses(version)
  const nextBaseToClass: Record<string, string> = {}
  const nextClassSizes: Record<string, [number, number]> = {}
  for (const [cls, info] of Object.entries(classes)) {
    nextClassSizes[cls] = info.size
    for (const b of info.bases) nextBaseToClass[b.name] = cls
  }
  replaceMap(baseToClass, nextBaseToClass)
  replaceMap(classSizes, nextClassSizes)
}

/** Resolve an icon for an item row. Tries the item's own name first (the
 *  unique's icon for unique rows, the base's icon for base rows), then the
 *  base's icon, then any unique that drops on that base. The last hop covers
 *  unique-only bases that never appear as a normal item and so are absent
 *  from item-icons-*.json -- one of their uniques' art is better than empty. */
export function iconFor(name: string, baseType?: string): string | undefined {
  const direct = iconMap[name]
  if (direct) return direct
  const base = baseType ?? name
  const baseIcon = iconMap[base]
  if (baseIcon) return baseIcon
  const uniques = uniquesByBase[base]
  if (!uniques) return undefined
  for (const u of uniques) {
    const icon = iconMap[u]
    if (icon) return icon
  }
  return undefined
}

export const divCardArtMap = new Map((divCardsData as Array<{ name: string; art: string }>).map((c) => [c.name, c.art]))
