//All external URLs that Scalpel connects to.

/** Path of Exile website (login, trade search pages) */
export const POE_WEBSITE = 'https://www.pathofexile.com'

/** Version-aware trade URLs. PoE2 uses the /trade2 path prefix for both API and
 *  browser, but only the browser URLs take a `poe2/` realm segment between
 *  search/exchange and the league -- API paths omit it. This matches Exiled
 *  Exchange 2's wiring, cross-checked against live requests from the PoE2 trade
 *  site. /fetch, /data/stats, and /data/leagues differ only in the prefix. */
export function getTradeUrls(version: 1 | 2): {
  search: (league: string) => string
  exchange: (league: string) => string
  fetch: (ids: string, queryId: string) => string
  stats: string
  leagues: string
  webSearch: (league: string, queryId: string) => string
  webExchange: (league: string, queryId: string) => string
} {
  const prefix = version === 2 ? 'trade2' : 'trade'
  const webRealm = version === 2 ? 'poe2/' : ''
  const apiBase = `${POE_WEBSITE}/api/${prefix}`
  const webBase = `${POE_WEBSITE}/${prefix}`
  const enc = encodeURIComponent
  return {
    search: (l) => `${apiBase}/search/${enc(l)}`,
    exchange: (l) => `${apiBase}/exchange/${enc(l)}`,
    fetch: (ids, qid) => `${apiBase}/fetch/${ids}?query=${qid}`,
    stats: `${apiBase}/data/stats`,
    leagues: `${apiBase}/data/leagues`,
    webSearch: (l, id) => `${webBase}/search/${webRealm}${enc(l)}/${id}`,
    webExchange: (l, id) => `${webBase}/exchange/${webRealm}${enc(l)}/${id}`,
  }
}

/** Path of Exile CDN for item artwork */
export const POE_CDN = 'https://web.poecdn.com'

/** poe.ninja economy API for PoE1 item prices (dense overview, all types in one call) */
export const POE_NINJA_API = 'https://poe.ninja/poe1/api/economy/current/dense/overviews'

/** poe.ninja economy API for PoE2 currency prices. Different shape from PoE1:
 *  no dense/overviews endpoint exists, so we hit the currency exchange overview and
 *  convert primary-currency values (divine-denominated) into chaos-equivalents via
 *  the returned rates. Non-currency categories aren't covered here. */
export const POE_NINJA_POE2_EXCHANGE = 'https://poe.ninja/poe2/api/economy/exchange/current/overview'

/** Exiled Exchange 2's CDN-cached aggregator for PoE2 ninja data. Returns all
 *  13 economy categories in one response (vs 13 parallel calls direct to ninja).
 *  League slug is one of: league | leaguehc | standard | standardhc. Generously
 *  hosted by Keith Van (@kvan7), creator of Exiled Exchange 2 -- treat as a
 *  best-effort path with the direct-ninja path retained as fallback. */
export const POE2_NINJA_PROXY = 'https://api.exiledexchange2.dev/proxy'

/** GitHub API for update checks */
export const GITHUB_RELEASES_API = 'https://api.github.com/repos/scalpelpoe/scalpel/releases/latest'

/** GitHub for Electron binary downloads (only during full version upgrades) */
export const ELECTRON_RELEASES = 'https://github.com/electron/electron/releases/download'

/** GitHub releases page (user-facing, for manual download links in banners) */
export const GITHUB_RELEASES_PAGE = 'https://github.com/scalpelpoe/scalpel/releases/latest'

/** Raw GitHub URL prefix for the cheat-sheet starter packs hosted in this
 *  repo's /cheat-sheet-prefabs/ folder. Images are not bundled into the
 *  installer; they're fetched on demand when the user clicks "+ <Pack>" in
 *  Settings -> Sheets. */
export const CHEAT_SHEET_PREFAB_BASE_URL =
  'https://raw.githubusercontent.com/scalpelpoe/scalpel/main/cheat-sheet-prefabs/'

/** Runtime-fetched manifest of values that may change between releases (e.g.
 *  ninja league slugs). Fetched on app start; bundled copy in the repo root
 *  acts as the offline fallback. New leagues only need a push to main. */
export const MANIFEST_URL = 'https://raw.githubusercontent.com/scalpelpoe/scalpel/main/manifest.json'

/** "Powered by..." attribution links shown under the regex output bar. The
 *  underlying mod / regex data ships from these projects; we point users at the
 *  source so they can compare against the upstream tools and contribute upstream. */
export const POE_RE_URL = 'https://poe.re'
export const POE2_RE_URL = 'https://poe2.re'

/** URL of the curated plugin registry JSON (raw GitHub). Can be overridden
 *  via the pluginRegistryUrl setting for self-hosted registries. */
export const PLUGIN_REGISTRY_URL =
  'https://raw.githubusercontent.com/scalpelpoe/scalpel-plugins-registry/main/registry.json'

/** Construct the download URL for a plugin release asset on GitHub. */
export function pluginReleaseAssetUrl(repo: string, version: string, file: string): string {
  return `https://github.com/${repo}/releases/download/v${version}/${file}`
}
