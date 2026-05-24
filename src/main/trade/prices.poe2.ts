import { POE_NINJA_POE2_EXCHANGE, POE2_NINJA_PROXY } from '../../shared/endpoints'
import { getGameFeatures } from '../../shared/game-features'
import type { PriceInfo } from '../../shared/types'

/**
 * PoE2 ninja price fetching + processing. The PoE2 API has no dense/overviews
 * endpoint like PoE1 -- each category is fetched separately from the same
 * exchange endpoint with a different `type` param. Callers build a fresh price
 * map via `fetchAndBuildPoe2PriceMap` and swap it in atomically on success.
 *
 * Keep PoE2-specific pricing concerns in this file so the parent `prices.ts`
 * stays focused on dispatch + bookkeeping. No PoE1 data types leak in here.
 */

interface Poe2ExchangeLine {
  id: string
  primaryValue?: number
  sparkline?: { data: (number | null)[] }
}

interface Poe2ExchangeItem {
  id: string
  name: string
}

interface Poe2ExchangeResponse {
  core: {
    primary: string
    secondary: string
    rates: Record<string, number>
    items: Poe2ExchangeItem[]
  }
  lines: Poe2ExchangeLine[]
  items: Poe2ExchangeItem[]
}

export interface Poe2PriceResult {
  priceMap: Map<string, PriceInfo>
  pricesByVariant: Map<string, PriceInfo>
  uniquesByBase: Record<string, string[]>
}

// Categories that currently return populated data on the PoE2 exchange
// endpoint. Unique/SkillGem/BaseType etc. respond 200 but with empty lines,
// so we skip them to save requests.
const POE2_EXCHANGE_TYPES = [
  'Currency',
  'Fragments',
  'Abyss',
  'UncutGems',
  'LineageSupportGems',
  'Essences',
  'SoulCores',
  'Idols',
  'Runes',
  'Ritual',
  'Expedition',
  'Delirium',
  'Breach',
] as const

/** Apply a single exchange response to the given price map. Exalted orb is
 *  PoE2's economy baseline (the role chaos plays in PoE1); PriceInfo.chaosValue
 *  is named for PoE1 history but semantically holds "baseline currency count",
 *  so in PoE2 we store exalted-equivalents there. Ninja's response reports
 *  primary=divine and rates.X = "units of X per 1 divine", so:
 *    divineValue = primaryValue
 *    chaosValue  = primaryValue * rates.exalted (i.e. exalted-equivalent)
 *
 * ninjaCategory is the poe.ninja URL category segment for this API type (e.g.
 * 'currency', 'breach-catalyst'). Threaded in by the caller so this module
 * stays decoupled from the manifest. Core currencies always use 'currency'. */
export function applyResponse(
  resp: Poe2ExchangeResponse,
  priceMap: Map<string, PriceInfo>,
  ninjaCategory?: string,
): void {
  const exaltedPerPrimary = resp.core.rates?.exalted ?? 0
  const nameById = new Map<string, string>()
  for (const item of [...(resp.core.items ?? []), ...(resp.items ?? [])]) {
    if (item.id && item.name) nameById.set(item.id, item.name)
  }

  // Seed the core currencies (divine is always worth 1 primary by definition).
  for (const item of resp.core.items ?? []) {
    const divineValue = item.id === resp.core.primary ? 1 : 1 / (resp.core.rates?.[item.id] ?? 0)
    const chaosValue = divineValue * exaltedPerPrimary
    if (!Number.isFinite(chaosValue) || chaosValue <= 0) continue
    priceMap.set(item.name.toLowerCase(), { chaosValue, divineValue, ninjaCategory: 'currency' })
  }

  for (const line of resp.lines ?? []) {
    const name = nameById.get(line.id)
    const primary = line.primaryValue
    if (!name || primary == null || primary <= 0) continue
    priceMap.set(name.toLowerCase(), {
      chaosValue: primary * exaltedPerPrimary,
      divineValue: primary,
      graph: line.sparkline?.data,
      ninjaCategory,
    })
  }
}

// EE2 proxy slugs are fixed and map by position to game-features.ts's PoE2
// `leagues` array layout: [currentTemp, currentTempHC, Standard, Hardcore].
// When GGG launches a new PoE2 league, only game-features.ts needs updating;
// this mapping stays stable.
const POE2_PROXY_SLUGS = ['league', 'leaguehc', 'standard', 'standardhc'] as const

function poe2LeagueToProxySlug(league: string): string | undefined {
  const idx = getGameFeatures(2).leagues.indexOf(league)
  return idx >= 0 ? POE2_PROXY_SLUGS[idx] : undefined
}

interface Ee2OverviewLine {
  name?: string
  variant?: string
  primaryValue?: number
  sparkline?: { data: (number | null)[] }
}

interface Ee2ItemOverview {
  type: string
  lines: Ee2OverviewLine[]
}

interface Ee2OverviewResponse {
  core: {
    primary: string
    rates?: Record<string, number>
  }
  itemOverviews?: Ee2ItemOverview[]
}

/** Apply a single EE2 proxy response to the given price map. The proxy
 *  returns all 13 categories in one payload; lines already carry names
 *  (no id->items join needed). Math mirrors the existing PoE2 path:
 *    divineValue = primaryValue
 *    chaosValue  = primaryValue * rates.exalted (exalted-equivalent)
 *
 * categoryByType maps each overview's `type` string to a poe.ninja URL
 * category segment. Threaded in by the caller so this module stays decoupled
 * from the manifest. Core currencies (divine, exalted) always use 'currency'. */
export function applyProxyResponse(
  resp: Ee2OverviewResponse,
  priceMap: Map<string, PriceInfo>,
  categoryByType: Record<string, string> = {},
  pricesByVariant?: Map<string, PriceInfo>,
): void {
  const exaltedPerPrimary = resp.core.rates?.exalted ?? 0

  if (exaltedPerPrimary > 0) {
    priceMap.set('divine orb', { chaosValue: exaltedPerPrimary, divineValue: 1, ninjaCategory: 'currency' })
    priceMap.set('exalted orb', { chaosValue: 1, divineValue: 1 / exaltedPerPrimary, ninjaCategory: 'currency' })
  }

  for (const overview of resp.itemOverviews ?? []) {
    const ninjaCategory = categoryByType[overview.type]
    for (const line of overview.lines ?? []) {
      if (!line.name) continue
      if (line.primaryValue == null || line.primaryValue <= 0) continue
      const info = {
        chaosValue: line.primaryValue * exaltedPerPrimary,
        divineValue: line.primaryValue,
        graph: line.sparkline?.data,
        ninjaCategory,
      }
      priceMap.set(line.name.toLowerCase(), info)
      pricesByVariant?.set(`${line.name.toLowerCase()}|${line.variant ?? ''}`, info)
    }
  }
}

// The 8 unique overview types the EE2 proxy added. Each unique line's
// `variant` field is exactly the base type (e.g. "Shrine Sceptre"), so
// no parsing is needed -- unlike PoE1's heuristic dense-variant split.
const POE2_UNIQUE_TYPES = new Set([
  'UniqueWeapons',
  'UniqueArmours',
  'UniqueAccessories',
  'UniqueFlasks',
  'UniqueCharms',
  'UniqueJewels',
  'UniqueMaps',
  'UniqueSanctumRelics',
])

/** Build a PoE2 baseType -> [unique names] map from the EE2 proxy's unique
 *  overviews, merged with the bundled static catalogue (union per base,
 *  dynamic supplements static -- same merge PoE1's dense path does). The
 *  static map is threaded in by the caller so this module stays decoupled
 *  from the data import. Never mutates the passed static map. */
export function buildPoe2UniquesByBaseFromProxy(
  resp: Ee2OverviewResponse,
  staticMap: Record<string, string[]>,
): Record<string, string[]> {
  const merged: Record<string, Set<string>> = {}
  for (const [base, names] of Object.entries(staticMap)) {
    merged[base] = new Set(names)
  }
  for (const overview of resp.itemOverviews ?? []) {
    if (!POE2_UNIQUE_TYPES.has(overview.type)) continue
    for (const line of overview.lines ?? []) {
      if (!line.name || !line.variant) continue
      if (!merged[line.variant]) merged[line.variant] = new Set()
      merged[line.variant].add(line.name)
    }
  }
  const out: Record<string, string[]> = {}
  for (const [base, set] of Object.entries(merged)) out[base] = [...set]
  return out
}

/** Single-request alternative to `fetchAndBuildPoe2PriceMap`. Generously
 *  hosted by @kvan7. Caller should fall back to the direct ninja path on
 *  failure or unknown-league error.
 *
 * categoryByType maps proxy type strings to poe.ninja URL category segments.
 * Caller reads this from the manifest and passes it down.
 * staticUniquesByBase is the bundled unique catalogue; merged with dynamic
 * data from the proxy response. Threaded in by the caller. */
export async function fetchPoe2PricesFromProxy(
  league: string,
  fetchJson: (url: string) => Promise<unknown>,
  categoryByType: Record<string, string>,
  staticUniquesByBase: Record<string, string[]>,
): Promise<Poe2PriceResult> {
  const slug = poe2LeagueToProxySlug(league)
  if (!slug) throw new Error(`Unsupported PoE2 league for proxy: ${league}`)
  const resp = (await fetchJson(`${POE2_NINJA_PROXY}/${slug}/overviewData.json`)) as Ee2OverviewResponse
  const priceMap = new Map<string, PriceInfo>()
  const pricesByVariant = new Map<string, PriceInfo>()
  applyProxyResponse(resp, priceMap, categoryByType, pricesByVariant)
  const uniquesByBase = buildPoe2UniquesByBaseFromProxy(resp, staticUniquesByBase)
  return { priceMap, pricesByVariant, uniquesByBase }
}

/** Fetch every populated exchange category in parallel and return a freshly
 *  built price map. Caller swaps this into its module-level cache on success;
 *  failure should not clobber existing state (leave old cache intact).
 *
 * categoryByType maps ninja type strings to poe.ninja URL category segments.
 * Caller reads this from the manifest and passes it down.
 * staticUniquesByBase is the bundled unique catalogue. The direct-ninja
 * exchange endpoint never returns uniques, so pricesByVariant is always empty
 * and uniquesByBase is a shallow clone of the static map. This preserves
 * today's name-only fallback behavior exactly. */
export async function fetchAndBuildPoe2PriceMap(
  league: string,
  fetchJson: (url: string) => Promise<unknown>,
  categoryByType: Record<string, string>,
  staticUniquesByBase: Record<string, string[]>,
): Promise<Poe2PriceResult> {
  const responses = (await Promise.all(
    POE2_EXCHANGE_TYPES.map((type) =>
      fetchJson(`${POE_NINJA_POE2_EXCHANGE}?league=${encodeURIComponent(league)}&type=${type}`),
    ),
  )) as Poe2ExchangeResponse[]
  const priceMap = new Map<string, PriceInfo>()
  for (let i = 0; i < responses.length; i++) {
    const type = POE2_EXCHANGE_TYPES[i]
    applyResponse(responses[i], priceMap, categoryByType[type])
  }
  // The direct-ninja exchange endpoint never returns uniques, so there is
  // no variant data and the base map stays the static catalogue. Empty
  // pricesByVariant preserves today's name-only fallback behavior exactly.
  return { priceMap, pricesByVariant: new Map(), uniquesByBase: { ...staticUniquesByBase } }
}
