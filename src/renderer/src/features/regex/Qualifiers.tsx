import { atLeastRegex } from './number-regex'
import { MAP_REWARD_LABELS } from '@shared/data/regex/map-mods'

export interface Qualifier {
  id: string
  label: string
  keyword: string
  suffix: string
}

export type QualifierValues = Record<string, number | null>

export interface QualifierGroup {
  label: string
  icon: string
  defaultOpen: boolean
  qualifiers: Qualifier[]
}

export const QUALIFIER_GROUPS: QualifierGroup[] = [
  {
    label: 'General',
    icon: 'setting-config',
    defaultOpen: true,
    qualifiers: [
      // 3.30 replaced Item Quantity with Atlas Drops; the id stays 'quantity' so saved presets keep working.
      { id: 'quantity', label: MAP_REWARD_LABELS.quantity, keyword: 'as d', suffix: '%' }, // poe.re: "as d.*"
      { id: 'packsize', label: MAP_REWARD_LABELS.packsize, keyword: 'r pa', suffix: '%' }, // "iz" also hit Quality (Pack Size)
      { id: 'morecurrency', label: MAP_REWARD_LABELS.morecurrency, keyword: 'ore cu', suffix: '%' },
      // 3.30 replaced More Scarabs with More Threads; id kept for saved presets.
      { id: 'morescarabs', label: MAP_REWARD_LABELS.morescarabs, keyword: 'e thr', suffix: '%' },
      { id: 'moremaps', label: MAP_REWARD_LABELS.moremaps, keyword: 're maps', suffix: '%' },
      { id: 'rarity', label: MAP_REWARD_LABELS.rarity, keyword: 'm rar', suffix: '%' },
    ],
  },
  {
    label: 'Quality',
    icon: 'compass',
    defaultOpen: false,
    qualifiers: [
      { id: 'quality', label: 'Quality', keyword: 'ty \\(Quantity\\):', suffix: '%' }, // poe.re: "ty (Quantity):.*"
      { id: 'quality_packsize', label: 'Maven Quality - Pack Size', keyword: 'ze\\)', suffix: '%' }, // poe.re: "ze).*"
      { id: 'quality_rarity', label: 'Maven Quality - Rarity', keyword: '\\(rar', suffix: '%' }, // poe.re: "\(rar.*"
      { id: 'quality_currency', label: 'Maven Quality - Currency', keyword: '\\(curr', suffix: '%' }, // poe.re: "\(Curr.*"
      { id: 'quality_divination', label: 'Maven Quality - Divination Cards', keyword: '\\(div', suffix: '%' }, // poe.re: "\(div.*"
      { id: 'quality_scarab', label: 'Maven Quality - Threads', keyword: '\\(th', suffix: '%' }, // poe.re: "\(th.*"
    ],
  },
]

export const QUALIFIERS = QUALIFIER_GROUPS.flatMap((g) => g.qualifiers)

export function buildQualifierRegex(values: QualifierValues): string {
  const parts: string[] = []
  for (const q of QUALIFIERS) {
    const val = values[q.id]
    if (val == null || val <= 0) continue
    parts.push(`"${q.keyword}.*${atLeastRegex(val)}${q.suffix}"`)
  }
  return parts.join(' ')
}
