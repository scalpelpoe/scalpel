import dustValues from '@shared/data/economy/dust-values.json'
import uniqueInfoData from '@shared/data/items/unique-info.json'
import type { PoeItem } from '@shared/types'

const dustMap = dustValues as Record<string, number>
const baseToUniques = uniqueInfoData as Record<string, string[]>
const uniqueToBase: Record<string, string> = {}
for (const [base, uniques] of Object.entries(baseToUniques)) {
  for (const u of uniques) uniqueToBase[u] = base
}

const dustBaseMap: Record<string, number> = {}
for (const [name, val] of Object.entries(dustMap)) {
  const base = uniqueToBase[name]
  if (!base) continue
  if (!dustBaseMap[base] || val > dustBaseMap[base]) dustBaseMap[base] = val
}

function calcDust(baseDust: number, item: PoeItem): number {
  const ilvl = Math.min(Math.max(item.itemLevel, 65), 84)
  let bonus = item.quality * 2
  bonus += item.influence.length * 50
  const multiplier = (bonus + 100) / 100
  return Math.round(baseDust * 125 * (20 - (84 - ilvl)) * multiplier)
}

export function getDustInfo(item: PoeItem): { value: number; upTo?: boolean } | null {
  if (item.rarity !== 'Unique') return null
  const baseDust = dustMap[item.name] ?? dustMap[item.name.replace(/^(Foulborn|Imbued) /, '')]
  if (baseDust) return { value: calcDust(baseDust, item) }
  if (!item.identified) {
    const maxBaseDust = dustBaseMap[item.baseType]
    if (maxBaseDust) return { value: calcDust(maxBaseDust, item), upTo: true }
  }
  return null
}
