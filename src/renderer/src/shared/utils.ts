export { getItemIcon } from '../../../plugin-sdk/src/runtime-helpers/get-item-icon'

export function formatPrice(value: number): string {
  if (value >= 1000) return `${parseFloat((value / 1000).toFixed(1))}k`
  if (value >= 10) return String(Math.round(value))
  if (value >= 1) return String(parseFloat(value.toFixed(1)))
  return String(parseFloat(value.toFixed(2)))
}

export function formatDust(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

/** Alternating ("zebra") row background: even rows get a faint tint, odd rows
 *  are transparent. Default even tint is the common rgba(255,255,255,0.02); pass
 *  evenBg for rows that use a different tint (e.g. 0.03). */
export function zebraRowBg(index: number, evenBg = 'rgba(255,255,255,0.02)'): string {
  return index % 2 === 0 ? evenBg : 'transparent'
}
