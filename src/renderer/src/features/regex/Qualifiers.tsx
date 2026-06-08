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
      { id: 'quantity', label: 'Quantity', keyword: 'm q', suffix: '%' }, // poe.re: "m q.*"
      { id: 'packsize', label: 'Pack Size', keyword: 'iz', suffix: '%' }, // poe.re: "iz.*"
      { id: 'morecurrency', label: 'More Currency', keyword: 'ore cu', suffix: '%' },
      { id: 'morescarabs', label: 'More Scarabs', keyword: 'ore sc', suffix: '%' },
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
      { id: 'quality_rarity', label: 'Maven Quality - Rarity', keyword: 'ty\\)', suffix: '%' }, // poe.re: "ty).*"
      { id: 'quality_currency', label: 'Maven Quality - Currency', keyword: 'urr', suffix: '%' }, // poe.re: "urr.*"
      { id: 'quality_divination', label: 'Maven Quality - Divination Cards', keyword: 'div', suffix: '%' }, // poe.re: "div.*"
      { id: 'quality_scarab', label: 'Maven Quality - Scarabs', keyword: 'sca', suffix: '%' }, // poe.re: "sca.*"
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
