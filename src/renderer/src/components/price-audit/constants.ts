import { iconMap, divCardArtMap } from '../../shared/constants'
import { formatDust, formatPrice } from '../../shared/utils'
import dustValues from '../../../../shared/data/economy/dust-values.json'
import baseToUniques from '../../../../shared/data/items/unique-info.json'

export { iconMap, divCardArtMap }
export { formatDust, formatPrice }

// Build dust-by-base map: max dust value per base type
const _dustMap = dustValues as Record<string, number>
const _baseToUniques = baseToUniques as Record<string, string[]>
const _uniqueToBase: Record<string, string> = {}
for (const [base, uniques] of Object.entries(_baseToUniques)) {
  for (const name of uniques) _uniqueToBase[name] = base
}
export const dustBaseMap: Record<string, number> = {}
for (const [name, val] of Object.entries(_dustMap)) {
  const base = _uniqueToBase[name]
  if (!base) continue
  if (!dustBaseMap[base] || val > dustBaseMap[base]) dustBaseMap[base] = val
}

export const mirrorIcon =
  'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lEdXBsaWNhdGUiLCJzY2FsZSI6MX1d/8d7fea29d1/CurrencyDuplicate.png'

// Module-level so they survive component remounts after batch moves
export let lastMovedBelow: string | null = null
export let lastMovedAbove: string | null = null
export function setLastMovedBelow(v: string | null): void {
  lastMovedBelow = v
}
export function setLastMovedAbove(v: string | null): void {
  lastMovedAbove = v
}

// Persist slider state per tier block index
export const savedSliderState = new Map<
  number,
  { threshold: number; dustThreshold: number; filterMode: 'price' | 'dust' | 'both' }
>()

export interface AuditItem {
  name: string
  chaosValue: number | null
  divineValue?: number
  dustValue: number | null
  iconUrl: string | null
}

export function calcMaxDust(baseType: string): number | null {
  const baseDust = dustBaseMap[baseType]
  if (!baseDust) return null
  // ilvl 84, 0 quality, 0 influence for max base dust
  return Math.round(baseDust * 125 * 20)
}

export function formatTierLabel(tier: string): string {
  const m = tier.match(/^t(\d+)(.*)/)
  if (m) return `T${m[1]}${m[2] ? ` ${m[2]}` : ''}`
  if (tier === 'exhide') return 'Hidden'
  if (tier === 'restex') return 'Rest'
  return tier
}

// Log-scale slider helpers: position (0-1000) <-> actual value
// Preserves decimals for small ranges, rounds to integers for large ranges
export function logScale(pos: number, max: number): number {
  if (max <= 0 || pos <= 0) return 0
  const raw = Math.expm1((pos / 1000) * Math.log1p(max))
  if (max <= 10) return Math.round(raw * 10) / 10
  return Math.round(raw)
}

export function logPos(val: number, max: number): number {
  if (max <= 0 || val <= 0) return 0
  return Math.round((Math.log1p(val) / Math.log1p(max)) * 1000)
}

export const retierSelectStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '3px 20px 3px 6px',
  background: 'var(--bg-card)',
  color: 'var(--accent)',
  border: '1px solid rgba(255,255,255,0.04)',
  borderRadius: 4,
  width: 100,
  WebkitAppearance: 'none',
  appearance: 'none' as const,
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.4)' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 5px center',
}
