import { app, net } from 'electron'
import { getTradeUrls } from '@shared/endpoints'
import { getPoeVersion } from '../../game-state'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StatEntry {
  id: string
  text: string
  type: string
  option?: { options: Array<{ id: number; text: string }> }
}

// ─── Stat Cache State ─────────────────────────────────────────────────────────

let statEntries: StatEntry[] = []
let statsFetched = false
let refreshTimer: ReturnType<typeof setInterval> | null = null

/** Hard ceiling on the stats fetch. Without this a half-open TCP socket can
 *  stall `await ensureStatsLoaded()` forever and nothing else in the price
 *  check path ever runs -- not even the search the user actually asked for.
 *  30s is generous since the stats payload is multi-MB on first launch. */
const STATS_TIMEOUT_MS = 30000

/** Dedup in-flight fetches so two near-simultaneous callers don't fire two
 *  requests. Cleared on settle. */
let inFlight: Promise<void> | null = null

export function getStatEntries(): StatEntry[] {
  return statEntries
}

// Lazy statId -> canonical text map, rebuilt only when the statEntries array
// reference swaps (fetch / refresh / test seed). Shared by every producer that
// needs a mod's canonical trade text by id (premium matching, tablet sign
// detection) so there's a single map instead of one per producer.
let textById: Map<string, string> | null = null
let textBuiltFrom: StatEntry[] | null = null

/** Canonical trade text for a stat id, or '' if unknown. */
export function statTextById(id: string): string {
  if (!textById || textBuiltFrom !== statEntries) {
    textById = new Map()
    for (const e of statEntries) if (!textById.has(e.id)) textById.set(e.id, e.text)
    textBuiltFrom = statEntries
  }
  return textById.get(id) ?? ''
}

/** Drop the lazy statId -> text map so the next lookup rebuilds. Tests that seed
 *  fresh entries via _setStatEntries already swap the array reference (which
 *  invalidates the map), so this is belt-and-suspenders for explicit isolation. */
export function _resetStatTextCacheForTests(): void {
  textById = null
  textBuiltFrom = null
}

export function getStatsFetched(): boolean {
  return statsFetched
}

/** Internal setter used by the test hook in index.ts. Sets entries and marks
 *  stats as fetched. Does NOT touch the pseudo map -- that coordination
 *  happens in index.ts. */
export function _setStatEntries(entries: StatEntry[]): void {
  statEntries = entries
  statsFetched = true
}

/** Fetch stat entries from the PoE trade API (simple GET, no rate limiting needed) */
async function fetchStats(): Promise<void> {
  if (statsFetched) {
    // Refresh in the background every 6 hours for league changes
    if (!refreshTimer) {
      refreshTimer = setInterval(
        () => {
          statsFetched = false
          fetchStats()
        },
        6 * 60 * 60 * 1000,
      )
    }
    return
  }
  if (inFlight) return inFlight
  const url = getTradeUrls(getPoeVersion()).stats
  inFlight = (async () => {
    const started = Date.now()
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const request = net.request({
          url,
          method: 'GET',
          useSessionCookies: false, // anonymous POESESSID echoed back triggers CF challenges (#429)
          referrerPolicy: 'no-referrer-when-downgrade',
        })
        // Header set matches trade.ts (and APT/EE2's proxy): minimal headers,
        // Electron's default UA, no Origin / Referer / Sec-Fetch-* overrides.
        // Those last three are what put us in a stricter bucket than the
        // trade website was; APT actively strips them.
        request.setHeader('Content-Type', 'application/json')
        request.setHeader('Accept', 'application/json')
        request.setHeader('User-Agent', app.userAgentFallback)
        let body = ''
        let done = false
        const timer = setTimeout(() => {
          if (done) return
          done = true
          try {
            request.abort()
          } catch {
            /* already done */
          }
          reject(new Error(`stats fetch timed out after ${STATS_TIMEOUT_MS}ms`))
        }, STATS_TIMEOUT_MS)
        request.on('response', (response) => {
          response.on('data', (chunk) => {
            body += chunk.toString()
          })
          response.on('end', () => {
            if (done) return
            done = true
            clearTimeout(timer)
            resolve(body)
          })
        })
        request.on('error', (err) => {
          if (done) return
          done = true
          clearTimeout(timer)
          reject(err)
        })
        request.end()
      })
      const resp = JSON.parse(data) as {
        result: Array<{ id: string; label: string; entries: StatEntry[] }>
      }
      statEntries = resp.result.flatMap((cat) => cat.entries)
      statsFetched = true
    } catch (e) {
      console.error(`[trade] Failed to fetch stats from ${url} after ${Date.now() - started}ms:`, e)
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export { fetchStats as ensureStatsLoaded }
