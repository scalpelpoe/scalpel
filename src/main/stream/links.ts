import { POE_PROFILE_PREFIX, type StreamSnapshot } from '@scalpel/stream-contract'
import type { StreamSettings } from '@shared/contracts/stream'
import { ninjaAccountKey } from '@shared/poe-account'

/** What the streamer typed for "Build guide" as a stored link: empty stays empty, a bare
 *  "youtube.com/..." gains https://, anything that isn't a web address is refused. */
export function normalizeBuildGuideUrl(input: string): string {
  const text = input.trim()
  if (!text) return ''
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new Error(`${text} isn't a web address. Paste the guide's full link.`)
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname.includes('.')) {
    throw new Error(`${text} isn't a web address. Paste the guide's full link.`)
  }
  return url.href
}

/** The links a snapshot carries for these settings. */
export function snapshotLinks(prefs: StreamSettings): NonNullable<StreamSnapshot['links']> {
  const account = prefs.linkItemFilters ? ninjaAccountKey(prefs.poeAccount) : null
  return {
    filters: account ? `${POE_PROFILE_PREFIX}${encodeURIComponent(account)}/item-filters` : null,
    buildGuide: prefs.buildGuideUrl || null,
  }
}
