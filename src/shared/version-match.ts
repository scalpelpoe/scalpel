/**
 * Compare two versions in our format: `N.N.N` or `N.N.N-rcN`.
 * Positive when a > b, negative when a < b, zero when equal.
 * Segments compared numerically (so 0.10.0 > 0.9.9). A release beats any pre-release of
 * the same numeric version (0.9.5 > 0.9.5-rc1). Pre-release labels are string-compared.
 */
export function compareVersions(a: string, b: string): number {
  const [aMain, aPre = ''] = a.split('-')
  const [bMain, bPre = ''] = b.split('-')
  const aSegs = aMain.split('.').map(Number)
  const bSegs = bMain.split('.').map(Number)
  for (let i = 0; i < Math.max(aSegs.length, bSegs.length); i++) {
    const d = (aSegs[i] ?? 0) - (bSegs[i] ?? 0)
    if (d !== 0) return d
  }
  if (!aPre && bPre) return 1
  if (aPre && !bPre) return -1
  return aPre.localeCompare(bPre)
}

/**
 * Test a version entry against the current version. Entries can be either
 * - bare versions: `"0.10.1"` (exact match)
 * - prefixed comparators: `"<0.9.5"`, `"<=0.9.3"`, `">=0.11.0-rc1"`, `">0.8"`
 */
export function versionMatches(entry: string, current: string): boolean {
  const m = entry.match(/^(<=|>=|<|>|=)?(.+)$/)
  if (!m) return false
  const op = m[1] ?? '='
  const cmp = compareVersions(current, m[2].trim())
  if (op === '=') return cmp === 0
  if (op === '<') return cmp < 0
  if (op === '<=') return cmp <= 0
  if (op === '>') return cmp > 0
  return cmp >= 0
}

/** First matching entry (or null) from a list of bricked-version rules. */
export function findBrickedMatch(entries: string[] | undefined, current: string): string | null {
  if (!entries) return null
  return entries.find((e) => versionMatches(e, current)) ?? null
}
