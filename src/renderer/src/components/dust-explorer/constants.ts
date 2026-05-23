import dustValues from '../../../../shared/data/economy/dust-values.json'
import baseToUniques from '../../../../shared/data/items/unique-info.json'
// Dust explorer is PoE1-only (gated via features.dustExplorer). Both mirrorIconUrl
// and cachedBaseEntries below are module-load-time, so import the PoE1 sheet
// directly rather than going through the shared iconMap.
import itemIcons from '../../../../shared/data/items/item-icons-poe1.json'
import { getItemClasses } from '../../../../shared/data/items/item-classes'
import type { FilterType } from './types'

const dustMap = dustValues as Record<string, number>
const _baseToUniques = baseToUniques as Record<string, string[]>
const uniqueToBase: Record<string, string> = {}
for (const [base, uniques] of Object.entries(_baseToUniques)) {
  for (const name of uniques) uniqueToBase[name] = base
}
const iconMap = itemIcons as Record<string, string>
// PoE1-only module; pin to the PoE1 class list explicitly.
const _itemClasses = getItemClasses(1)
export const baseClassMap: Record<string, string> = {}
const classSizes: Record<string, [number, number]> = {}
for (const [cls, { bases, size }] of Object.entries(_itemClasses)) {
  classSizes[cls] = size
  for (const base of bases) baseClassMap[base.name] = cls
}

export const mirrorIconUrl = (itemIcons as Record<string, string>)['Mirror of Kalandra']

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

export const COL_PRICE = 44
export const COL_DUST = 50
export const COL_DPC = 72
export const COL_DPCS = 56

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
