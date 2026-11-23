/** Price Tracker for PoE1 uniques worth a divine or more: the league price
 *  history of the item's UNLINKED poe.ninja line. 5L/6L lines are priced
 *  separately on ninja and would inflate an unlinked copy, so they are never
 *  picked. Runs in main (renderer fetches to poe.ninja are CORS-blocked); takes
 *  its fetcher as an argument so it stays unit-testable without electron.
 *
 *  Every failure resolves to null -- the panel simply doesn't render. */
import type { ExchangePoint } from '@shared/contracts/exchange'
import type { UniqueTrackerDetails, UniqueTrackerQuery } from '@shared/contracts/unique-tracker'
import { POE_NINJA_STASH_HISTORY, POE_NINJA_STASH_OVERVIEW } from '@shared/endpoints'

/** Same TTL as the dense price cache -- ninja recomputes on that timescale. */
const CACHE_TTL = 10 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface OverviewLine {
  id?: number
  name?: string
  baseType?: string
  variant?: string
  links?: number
  chaosValue?: number
  divineValue?: number
  /** ninja's own page slug for this exact line ("mageblood-4-flasks-heavy-belt"). */
  detailsId?: string
  /** Foulborn mutations as mod templates ("+(32-38)% to ..."). ninja's variant
   *  label only abbreviates these ("Fast Bleed"), so they are what identifies
   *  which Foulborn line an item is. */
  mutatedModifiers?: { text?: string }[]
}

interface HistoryPoint {
  count?: number
  value?: number
  daysAgo?: number
}

export interface UniqueTrackerDeps {
  fetchJson: (url: string) => Promise<unknown>
  /** ninja overview type for a priced name ('UniqueArmour'), from the dense snapshot. */
  getNinjaType: (name: string) => string | undefined
  /** Current chaos-per-divine, used when the line carries no divineValue and to
   *  fill days missing from the divine history. */
  chaosPerDivine: number | undefined
  /** Divine Orb's daily chaos rate, oldest first, timestamps at UTC midnight. */
  divineHistory: () => Promise<ExchangePoint[]>
  /** poe.ninja page URL for a line, or null when the league has no ninja slug. */
  detailsUrl: (ninjaType: string, detailsId: string) => string | null
  now?: () => number
}

export type UniqueLinkDeps = Pick<UniqueTrackerDeps, 'fetchJson' | 'getNinjaType' | 'detailsUrl' | 'now'>

const overviewCache = new Map<string, { at: number; lines: OverviewLine[] }>()
const historyCache = new Map<string, { at: number; points: HistoryPoint[] }>()

/** ninja's variant label split into parts: comma-separated, and slash-separated
 *  for Atziri's Splendour-style defence combos ("Armour/ES/Life"). */
function variantParts(line: OverviewLine): string[] {
  return (line.variant ?? '')
    .split(/[,/]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** ninja label parts whose wording never appears verbatim on the item, mapped
 *  to the mod text that does. Checked against every Covens unique line. */
const PART_ALIASES: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  // Mageblood: "4 Flasks" -> "Leftmost 4 Magic Utility Flasks ..."
  [/^(\d+) flasks$/, (m) => `leftmost ${m[1]} `],
  // Abyss uniques: "2 Jewels" -> "Has 2 Abyssal Sockets"
  [/^(\d+) jewels?$/, (m) => `has ${m[1]} abyssal socket`],
  // Voices: "5 passives" -> "Adds 5 Small Passive Skills which grant nothing"
  [/^(\d+) passives$/, (m) => `adds ${m[1]} small passive skill`],
  [/^es$/, () => 'energy shield'],
  [/^life$/, () => 'maximum life'],
]

/** Whether one variant part ("culling strike", "4 flasks") shows up in the
 *  item's lowercased mod text. */
function partMatches(part: string, text: string): boolean {
  for (const [re, toText] of PART_ALIASES) {
    const m = re.exec(part)
    if (m) return text.includes(toText(m))
  }
  return text.includes(part)
}

/** Collapse a mod line to a value-free template so ninja's ranges and an
 *  item's rolled numbers compare equal: "+(32-38)% to X" and "+35% to X" both
 *  become "#% to x". Wrapped lines (joined with a newline) fold to one space. */
export function modTemplate(text: string): string {
  return text
    .toLowerCase()
    .replace(/[+-]?(\(-?[\d.]+--?[\d.]+\)|\d+(\.\d+)?)/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

/** ninja prices 5L and 6L copies as their own lines; everything under 5 links
 *  shares the unlinked line. */
function linkBucket(links: number | undefined): 0 | 5 | 6 {
  const n = links ?? 0
  return n >= 6 ? 6 : n >= 5 ? 5 : 0
}

/** The ninja line for this unique at the given link count, or null when ninja
 *  has none. Same-name lines are narrowed to the item's base type (replicas and
 *  reworks can share names across bases), then ranked by how many of the
 *  variant's parts appear in the item's mod text -- most matched, then fewest
 *  unmatched, then cheapest, so an ambiguous match never overstates the price. */
export function pickLine(lines: OverviewLine[], q: UniqueTrackerQuery, links = 0): OverviewLine | null {
  const bucket = linkBucket(links)
  const candidates = lines.filter(
    (l) => l.name === q.name && typeof l.id === 'number' && linkBucket(l.links) === bucket && (l.chaosValue ?? 0) > 0,
  )
  const sameBase = candidates.filter((l) => !l.baseType || l.baseType === q.baseType)
  const pool = sameBase.length > 0 ? sameBase : candidates
  if (pool.length <= 1) return pool[0] ?? null

  const text = q.modText.join('\n').toLowerCase()
  const templates = new Set(q.modText.map(modTemplate))
  // Mutated mods first (they name a Foulborn line exactly), then ninja's
  // variant-label parts, then cheapest. For labels, fewest UNMATCHED parts
  // wins before most matched: a line whose label names something the item
  // lacks is wrong outright (an Armour Atziri's Splendour also carries Life,
  // so "Armour/ES/Life" matches two parts but claims ES it doesn't have).
  // Each key sorts ascending, so "more matched" is stored negated.
  const rank = (l: OverviewLine): number[] => {
    const mutated = (l.mutatedModifiers ?? []).map((m) => modTemplate(m.text ?? '')).filter(Boolean)
    const mutMatched = mutated.filter((m) => templates.has(m)).length
    const parts = variantParts(l)
    const matched = parts.filter((p) => partMatches(p, text)).length
    return [-mutMatched, mutated.length - mutMatched, parts.length - matched, -matched, l.chaosValue ?? 0]
  }
  return [...pool].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]
    return 0
  })[0]
}

/** The unlinked line -- what the tracker charts, since linked copies would
 *  inflate the price of an ordinary drop. */
export function pickUnlinkedLine(lines: OverviewLine[], q: UniqueTrackerQuery): OverviewLine | null {
  return pickLine(lines, q, 0)
}

function utcDay(t: number): number {
  return Math.floor(t / DAY_MS) * DAY_MS
}

/** Turn ninja's daysAgo history into chaos and divine series, oldest first.
 *  Each day's divine value divides by THAT day's divine rate, so the divine
 *  line shows the item's real movement rather than the divine's. */
export function buildSeries(
  history: HistoryPoint[],
  divineByDay: Map<number, number>,
  chaosPerDivine: number | undefined,
  now: number,
): { chaos: ExchangePoint[]; divine: ExchangePoint[] } {
  const today = utcDay(now)
  const chaos: ExchangePoint[] = []
  const divine: ExchangePoint[] = []
  for (const p of history) {
    if (typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value <= 0) continue
    if (typeof p.daysAgo !== 'number') continue
    const t = today - p.daysAgo * DAY_MS
    const volume = p.count ?? 0
    chaos.push({ t, rate: p.value, volume })
    const rate = divineByDay.get(t) ?? chaosPerDivine
    if (rate && rate > 0) divine.push({ t, rate: p.value / rate, volume })
  }
  chaos.sort((a, b) => a.t - b.t)
  divine.sort((a, b) => a.t - b.t)
  return { chaos, divine }
}

async function cachedOverview(
  league: string,
  type: string,
  deps: Pick<UniqueTrackerDeps, 'fetchJson'>,
  now: number,
): Promise<OverviewLine[]> {
  const key = `${league}|${type}`
  const hit = overviewCache.get(key)
  if (hit && now - hit.at < CACHE_TTL) return hit.lines
  const url = `${POE_NINJA_STASH_OVERVIEW}?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`
  const raw = (await deps.fetchJson(url)) as { lines?: OverviewLine[] } | null
  const lines = Array.isArray(raw?.lines) ? raw.lines : []
  overviewCache.set(key, { at: now, lines })
  return lines
}

async function cachedHistory(
  league: string,
  type: string,
  id: number,
  deps: UniqueTrackerDeps,
  now: number,
): Promise<HistoryPoint[]> {
  const key = `${league}|${type}|${id}`
  const hit = historyCache.get(key)
  if (hit && now - hit.at < CACHE_TTL) return hit.points
  const url = `${POE_NINJA_STASH_HISTORY}?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}&id=${id}`
  const raw = await deps.fetchJson(url)
  const points = Array.isArray(raw) ? (raw as HistoryPoint[]) : []
  historyCache.set(key, { at: now, points })
  return points
}

/** Resolve the tracker for one unique, or null when it isn't a ninja-priced
 *  unique, has no unlinked line, or that line is under one divine. */
export async function fetchUniqueTracker(
  league: string,
  q: UniqueTrackerQuery,
  deps: UniqueTrackerDeps,
): Promise<UniqueTrackerDetails | null> {
  if (!league) return null
  const type = deps.getNinjaType(q.name)
  if (!type?.startsWith('Unique')) return null
  const now = (deps.now ?? Date.now)()
  try {
    const line = pickUnlinkedLine(await cachedOverview(league, type, deps, now), q)
    if (!line || typeof line.id !== 'number') return null
    const chaosValue = line.chaosValue ?? 0
    const divineValue =
      line.divineValue ?? (deps.chaosPerDivine && deps.chaosPerDivine > 0 ? chaosValue / deps.chaosPerDivine : 0)
    if (divineValue < 1) return null

    const [history, divineHistory] = await Promise.all([
      cachedHistory(league, type, line.id, deps, now),
      deps.divineHistory().catch(() => [] as ExchangePoint[]),
    ])
    const divineByDay = new Map(divineHistory.map((p) => [utcDay(p.t), p.rate]))
    const series = buildSeries(history, divineByDay, deps.chaosPerDivine, now)

    return {
      name: q.name,
      variant: line.variant || undefined,
      ninjaUrl: (line.detailsId && deps.detailsUrl(type, line.detailsId)) || undefined,
      pairs: [
        { currency: 'divine', rate: divineValue, volumePerHour: 0, history: series.divine },
        { currency: 'chaos', rate: chaosValue, volumePerHour: 0, history: series.chaos },
      ],
    }
  } catch (e) {
    console.error('[FilterScalpel] Unique tracker fetch failed:', e)
    return null
  }
}

/** poe.ninja page for exactly this unique: its link count and, where ninja
 *  splits one, its variant. Null when ninja doesn't list it (callers fall back
 *  to the derived slug). A 5L/6L item with no linked line on ninja falls back
 *  to the unlinked page rather than nothing. */
export async function resolveUniqueNinjaUrl(
  league: string,
  q: UniqueTrackerQuery,
  deps: UniqueLinkDeps,
): Promise<string | null> {
  if (!league) return null
  const type = deps.getNinjaType(q.name)
  if (!type?.startsWith('Unique')) return null
  try {
    const lines = await cachedOverview(league, type, deps, (deps.now ?? Date.now)())
    const line = pickLine(lines, q, q.linkedSockets) ?? pickLine(lines, q, 0)
    return line?.detailsId ? deps.detailsUrl(type, line.detailsId) : null
  } catch (e) {
    console.error('[FilterScalpel] Unique ninja link lookup failed:', e)
    return null
  }
}

export function _resetUniqueTrackerCacheForTests(): void {
  overviewCache.clear()
  historyCache.clear()
}
