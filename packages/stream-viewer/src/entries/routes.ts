import type { StreamSource } from '../data/api'

export type WebSource = Exclude<StreamSource, { kind: 'twitch' }>

export type WebRoute =
  | { view: 'landing' }
  | { view: 'page'; source: WebSource }
  | { view: 'obs'; source: WebSource; layout: 'compact' | 'full' }

/** live.scalpel.fourth.party paths:
 *  - "/" landing
 *  - "/<channel>" and "/<channel>/obs" for Twitch-linked streamers (slug = Twitch login)
 *  - "/p/<profileId>" and "/p/<profileId>/obs" share links for everyone else */
export function parseRoute(pathname: string, search: string): WebRoute {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length === 0) return { view: 'landing' }

  let source: WebSource
  let rest: string[]
  if (parts[0] === 'p' && parts[1]) {
    source = { kind: 'profile', profileId: parts[1] }
    rest = parts.slice(2)
  } else {
    source = { kind: 'slug', slug: parts[0].toLowerCase() }
    rest = parts.slice(1)
  }

  if (rest[0] === 'obs') {
    const layout = new URLSearchParams(search).get('layout') === 'full' ? 'full' : 'compact'
    return { view: 'obs', source, layout }
  }
  return { view: 'page', source }
}
