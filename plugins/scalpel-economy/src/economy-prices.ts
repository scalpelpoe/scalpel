import type { PriceEntry } from '@scalpelpoe/plugin-sdk'

export function fmtNum(value: number): string {
  if (!Number.isFinite(value)) return '?'
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  if (value >= 100) return value.toFixed(0)
  if (value >= 10) return value.toFixed(1)
  return value.toFixed(value >= 1 ? 1 : 2)
}

export function priceBadge(entry: Pick<PriceEntry, 'chaosValue' | 'divineValue'>): string {
  const div = entry.divineValue
  if (div != null && div >= 1) return `${fmtNum(div)} div`
  return `${fmtNum(entry.chaosValue)} ex`
}

export function groupEntriesByCategory(entries: PriceEntry[]): Map<string, PriceEntry[]> {
  const map = new Map<string, PriceEntry[]>()
  for (const e of entries) {
    const slug = e.category || 'currency'
    const list = map.get(slug) ?? []
    list.push(e)
    map.set(slug, list)
  }
  for (const [, list] of map) {
    list.sort((a, b) => (b.divineValue ?? b.chaosValue) - (a.divineValue ?? a.chaosValue))
  }
  return map
}

export function agoText(updatedAt: number | null): string {
  if (updatedAt == null) return 'loading…'
  const mins = Math.max(0, Math.round((Date.now() - updatedAt) / 60000))
  if (mins < 1) return 'updated just now'
  if (mins < 60) return `updated ${mins}m ago`
  return `updated ${Math.round(mins / 60)}h ago`
}

export function normSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function entryMatchesQuery(entry: PriceEntry, queryNorm: string): boolean {
  if (!queryNorm) return true
  const n = normSearch(entry.name)
  return n.includes(queryNorm)
}
