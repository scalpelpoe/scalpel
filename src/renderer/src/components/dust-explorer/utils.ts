import { FilterType } from './types'
import { formatDust } from '../../shared/utils'

export { formatDust }

export function formatRatio(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  if (value >= 10) return String(Math.round(value))
  return value.toFixed(1)
}

const DUST_TYPES = new Set<FilterType>(['dustIlvl84', 'dustPerChaos', 'dustPerChaosPerSlot'])

export function scaleRange(pos: number, min: number, max: number, type: FilterType): number {
  const range = max - min
  if (range <= 0 || pos <= 0) return min
  const t = pos / 1000
  if (DUST_TYPES.has(type)) {
    // Power curve (cubic) - ramps faster from the start
    return min + Math.round(range * t * t * t)
  }
  // Log scale for price
  const raw = Math.expm1(t * Math.log1p(range))
  if (range <= 10) return min + Math.round(raw * 10) / 10
  return min + Math.round(raw)
}

export function posRange(val: number, min: number, max: number, type: FilterType): number {
  const range = max - min
  if (range <= 0 || val <= min) return 0
  const t = (val - min) / range
  if (DUST_TYPES.has(type)) {
    return Math.round(Math.pow(t, 1 / 3) * 1000)
  }
  return Math.round((Math.log1p(val - min) / Math.log1p(range)) * 1000)
}
