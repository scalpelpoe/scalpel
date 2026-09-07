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

type VersionOperator = '=' | '<' | '<=' | '>' | '>=' | '^' | '~'

interface VersionComparator {
  operator: VersionOperator
  version: string
  segments: number[]
}

const VERSION_PATTERN = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/

function parseComparator(entry: string): VersionComparator | null {
  const match = entry.match(/^(<=|>=|<|>|=|\^|~)?(.+)$/)
  if (!match || !VERSION_PATTERN.test(match[2])) return null
  return {
    operator: (match[1] ?? '=') as VersionOperator,
    version: match[2],
    segments: match[2].split('-', 1)[0].split('.').map(Number),
  }
}

function exclusiveUpperBound(comparator: VersionComparator): string {
  const segments = [...comparator.segments, 0, 0].slice(0, 3)
  let incrementAt: number
  if (comparator.operator === '~') {
    incrementAt = comparator.segments.length === 1 ? 0 : 1
  } else {
    const firstNonZero = comparator.segments.findIndex((segment) => segment !== 0)
    incrementAt = firstNonZero === -1 ? comparator.segments.length - 1 : firstNonZero
  }
  segments[incrementAt]++
  segments.fill(0, incrementAt + 1)
  return segments.join('.')
}

function comparatorMatches(comparator: VersionComparator, current: string): boolean {
  const cmp = compareVersions(current, comparator.version)
  if (comparator.operator === '=') return cmp === 0
  if (comparator.operator === '<') return cmp < 0
  if (comparator.operator === '<=') return cmp <= 0
  if (comparator.operator === '>') return cmp > 0
  if (comparator.operator === '>=') return cmp >= 0
  return cmp >= 0 && compareVersions(current, exclusiveUpperBound(comparator)) < 0
}

/** Whether an expression uses the version range syntax supported by versionMatches. */
export function isValidVersionRange(entry: string): boolean {
  const comparators = entry.trim().split(/\s+/)
  return entry.trim().length > 0 && comparators.every((comparator) => parseComparator(comparator) !== null)
}

/**
 * Test a version range against the current version. Whitespace-separated
 * entries are combined with logical AND. An entry can be any of:
 * - bare versions: `"0.10.1"` (exact match)
 * - prefixed comparators: `"<0.9.5"`, `"<=0.9.3"`, `">=0.11.0-rc1"`, `">0.8"`
 * - caret or tilde ranges: `"^1.2.3"`, `"~1.2.3"`
 */
export function versionMatches(entry: string, current: string): boolean {
  const comparators = entry.trim().split(/\s+/).map(parseComparator)
  return comparators.every((comparator) => comparator !== null && comparatorMatches(comparator, current))
}

/** First matching entry (or null) from a list of bricked-version rules. */
export function findBrickedMatch(entries: string[] | undefined, current: string): string | null {
  if (!entries) return null
  return entries.find((e) => versionMatches(e, current)) ?? null
}
