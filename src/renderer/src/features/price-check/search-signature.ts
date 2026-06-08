import type { StatFilter } from './types'

export function searchSignature(
  filters: Pick<StatFilter, 'id' | 'enabled' | 'min' | 'max' | 'chipState'>[],
  settings: { listedTime: string; priceOption: string; statusOption: string },
): string {
  const filterPart = filters
    .map((f) => `${f.id}:${String(f.enabled)}:${String(f.min)}:${String(f.max)}:${String(f.chipState)}`)
    .join('|')
  return `${filterPart}__${settings.listedTime}__${settings.priceOption}__${settings.statusOption}`
}
