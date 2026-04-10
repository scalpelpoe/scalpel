import { readFileSync } from 'fs'
import { parseFilterFile } from './filter/parser'
import { loadIntents } from './filter/intent-recorder'
import { registerFilterBaseTypes } from './trade/clipboard'
import { saveVersion } from './update/versions'
import type { FilterFile } from '../shared/types'

// ---- In-memory filter state ------------------------------------------------

let currentFilter: FilterFile | null = null

export function getCurrentFilter(): FilterFile | null {
  return currentFilter
}

export function setCurrentFilter(filter: FilterFile | null): void {
  currentFilter = filter
}

// ---- Color frequency cache -------------------------------------------------

export type ColorFreqEntry = { r: number; g: number; b: number; a: number; count: number; category: string }
export type ColorFreqMap = Record<string, ColorFreqEntry[]>

let colorFreqCache: { filterPath: string; blockCount: number; freqs: ColorFreqMap } | null = null

export function getColorFrequencies(): ColorFreqMap {
  if (!currentFilter) return {}
  // Return cached if filter hasn't changed
  if (
    colorFreqCache &&
    colorFreqCache.filterPath === currentFilter.path &&
    colorFreqCache.blockCount === currentFilter.blocks.length
  ) {
    return colorFreqCache.freqs
  }

  const counts: Record<
    string,
    Map<string, { r: number; g: number; b: number; a: number; count: number; categoryWeights: Map<string, number> }>
  > = {
    SetTextColor: new Map(),
    SetBorderColor: new Map(),
    SetBackgroundColor: new Map(),
  }

  // Multipliers for item classes/rarities that matter more in endgame
  const CLASS_WEIGHT: Record<string, number> = {
    Currency: 5,
    'Stackable Currency': 5,
    'Delve Stackable Currency': 5,
    'Map Fragments': 4,
    Unique: 4,
    'Divination Cards': 4,
    Jewel: 3,
    'Abyss Jewel': 3,
    Gem: 2,
    'Skill Gems': 2,
    'Support Gems': 2,
    Map: 3,
    Maps: 3,
    Heist: 2,
    Blueprint: 2,
    Contract: 2,
  }
  const RARITY_WEIGHT: Record<string, number> = {
    Unique: 4,
    Rare: 1,
    Magic: 0.5,
    Normal: 0.25,
  }

  for (const block of currentFilter.blocks) {
    if (block.visibility !== 'Show') continue

    // Weight by the number of BaseType values
    const baseTypeCond = block.conditions.find((c) => c.type === 'BaseType')
    const itemCount = baseTypeCond ? Math.max(baseTypeCond.values.length, 1) : 1

    // Boost by item class
    const classCond = block.conditions.find((c) => c.type === 'Class')
    let classMultiplier = 1
    if (classCond) {
      for (const v of classCond.values) {
        const w = CLASS_WEIGHT[v]
        if (w && w > classMultiplier) classMultiplier = w
      }
    }

    // Boost by rarity
    const rarityCond = block.conditions.find((c) => c.type === 'Rarity')
    let rarityMultiplier = 1
    if (rarityCond) {
      for (const v of rarityCond.values) {
        const w = RARITY_WEIGHT[v]
        if (w !== undefined && w > rarityMultiplier) rarityMultiplier = w
      }
    }

    const weight = itemCount * classMultiplier * rarityMultiplier

    // Determine the category label for this block
    const category = classCond?.values[0] ?? (rarityCond ? rarityCond.values.join('/') : 'General')

    for (const action of block.actions) {
      const map = counts[action.type]
      if (!map) continue
      const [r, g, b, a] = action.values.map(Number)
      const key = `${r},${g},${b},${a ?? 255}`
      const existing = map.get(key)
      if (existing) {
        existing.count += weight
        existing.categoryWeights.set(category, (existing.categoryWeights.get(category) ?? 0) + weight)
      } else {
        map.set(key, { r, g, b, a: a ?? 255, count: weight, categoryWeights: new Map([[category, weight]]) })
      }
    }
  }

  const freqs: ColorFreqMap = {}
  for (const [type, map] of Object.entries(counts)) {
    freqs[type] = [...map.values()]
      .sort((a, b) => b.count - a.count)
      .map(({ categoryWeights, ...rest }) => {
        // Pick the category with the highest weight
        let topCat = 'General'
        let topWeight = 0
        for (const [cat, w] of categoryWeights) {
          if (w > topWeight) {
            topCat = cat
            topWeight = w
          }
        }
        return { ...rest, category: topCat }
      })
  }

  colorFreqCache = { filterPath: currentFilter.path, blockCount: currentFilter.blocks.length, freqs }
  return freqs
}

// ---- Filter loading --------------------------------------------------------

export function loadFilter(path: string, autoVersionLabel?: string): FilterFile | null {
  try {
    const content = readFileSync(path, 'utf-8')
    currentFilter = parseFilterFile(path, content)
    // Load intent log for this filter
    const filterName =
      currentFilter.rawLines
        .slice(0, 15)
        .find((l) => l.startsWith('#name:'))
        ?.replace('#name:', '')
        .trim() ?? ''
    loadIntents(currentFilter.path, filterName)
    // Extract all base types from the filter for magic item parsing
    const filterBaseTypes = currentFilter.blocks.flatMap((b) =>
      b.conditions.filter((c) => c.type === 'BaseType').flatMap((c) => c.values),
    )
    registerFilterBaseTypes(filterBaseTypes)
    if (autoVersionLabel) {
      saveVersion(path, false, autoVersionLabel)
    }
    return currentFilter
  } catch (err) {
    console.error('[FilterScalpel] Failed to load filter:', err)
    return null
  }
}
