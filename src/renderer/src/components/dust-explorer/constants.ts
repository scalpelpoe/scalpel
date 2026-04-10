import dustValues from '../../../../shared/data/economy/dust-values.json'
import baseToUniques from '../../../../shared/data/items/unique-info.json'
import itemIcons from '../../../../shared/data/items/item-icons.json'
import itemClassesData from '../../../../shared/data/items/item-classes.json'
import { FilterType } from './types'

const dustMap = dustValues as Record<string, number>
const _baseToUniques = baseToUniques as Record<string, string[]>
const uniqueToBase: Record<string, string> = {}
for (const [base, uniques] of Object.entries(_baseToUniques)) {
  for (const name of uniques) uniqueToBase[name] = base
}
const iconMap = itemIcons as Record<string, string>
const _itemClasses = itemClassesData as Record<string, { bases: string[]; size: [number, number] }>
const baseClassMap: Record<string, string> = {}
const classSizes: Record<string, [number, number]> = {}
for (const [cls, { bases, size }] of Object.entries(_itemClasses)) {
  classSizes[cls] = size
  for (const base of bases) baseClassMap[base] = cls
}

export const mirrorIconUrl =
  'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lEdXBsaWNhdGUiLCJzY2FsZSI6MX1d/8d7fea29d1/CurrencyDuplicate.png'

// Pre-compute base entries at module level so it doesn't block render
export const cachedBaseEntries = (() => {
  const entries: { name: string; baseType: string; dustIlvl84: number; slots: number; iconUrl: string | null }[] = []
  for (const [name, baseDust] of Object.entries(dustMap)) {
    const base = uniqueToBase[name]
    if (!base) continue
    const cls = baseClassMap[base]
    const size = cls ? classSizes[cls] : undefined
    const slots = size ? size[0] * size[1] : 1
    entries.push({
      name,
      baseType: base,
      dustIlvl84: Math.round(baseDust * 125 * 20),
      slots,
      iconUrl: iconMap[name] ?? null,
    })
  }
  return entries
})()

export const COL_PRICE = 50
export const COL_DUST = 50
export const COL_DPC = 72
export const COL_DPCS = 62

export const ALL_FILTER_TYPES: FilterType[] = [
  'name',
  'chaosValue',
  'dustIlvl84',
  'dustPerChaos',
  'dustPerChaosPerSlot',
]

export const FILTER_LABELS: Record<FilterType, string> = {
  name: 'Name',
  chaosValue: 'Price',
  dustIlvl84: 'Dust Value',
  dustPerChaos: 'Dust/Chaos',
  dustPerChaosPerSlot: 'Dust/Chaos/Slot',
}

// Persist filters across tab switches (mutable object so importing modules can update it)
export const persistedState: {
  filters: import('./types').ActiveFilter[]
  sortKey: import('./types').SortKey
  sortDir: import('./types').SortDir
} = {
  filters: [],
  sortKey: 'dustPerChaos',
  sortDir: 'desc',
}
