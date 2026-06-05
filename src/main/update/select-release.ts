/** Pick the release for a list-based channel (beta/experimental) from the full
 *  GitHub releases list (newest-first). Experimental takes the newest installable
 *  release of any kind; beta excludes `-exp`-tagged builds so experimental-only
 *  releases never reach beta users. */
const hasManifest = (r: { assets: Array<{ name: string }> }): boolean =>
  r.assets.some((a) => a.name === 'manifest.json')

export function selectListRelease<T extends { tag_name: string; assets: Array<{ name: string }> }>(
  channel: 'beta' | 'experimental',
  releases: T[],
): T | undefined {
  if (channel === 'experimental') return releases.find(hasManifest)
  return releases.find((r) => hasManifest(r) && !/-exp/i.test(r.tag_name))
}
