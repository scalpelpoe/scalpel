import { atLeastRegex } from './number-regex'

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
      { id: 'quantity', label: 'Atlas Drops', keyword: 'as d', suffix: '%' }, // poe.re: "as d.*"
      { id: 'packsize', label: 'Pack Size', keyword: 'r pa', suffix: '%' }, // poe.re: "r pa.*" ("iz" also hit Quality (Pack Size))
      { id: 'morecurrency', label: 'More Currency', keyword: 'ore cu', suffix: '%' },
      // 3.30 replaced More Scarabs with More Threads; id kept for saved presets.
      { id: 'morescarabs', label: 'More Threads', keyword: 'e thr', suffix: '%' }, // poe.re: "e thr.*"
      { id: 'moremaps', label: 'More Maps', keyword: 're maps', suffix: '%' }, // poe.re: "re maps.*"
      { id: 'rarity', label: 'Item Rarity', keyword: 'm rar', suffix: '%' }, // poe.re: "m rar.*"
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
