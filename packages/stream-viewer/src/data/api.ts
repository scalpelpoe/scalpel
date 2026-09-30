import type { StreamHead, StreamSnapshot } from '@scalpel/stream-contract'
import { paths } from '@scalpel/stream-contract/paths'
import { API_BASE } from '../config'

/** Which channel's gear to show: a Twitch channel (extension), a public slug, or a
 *  profile id (the share link for streamers without a Twitch link). */
export type StreamSource =
  | { kind: 'twitch'; channelId: string }
  | { kind: 'slug'; slug: string }
  | { kind: 'profile'; profileId: string }

function headPath(source: StreamSource): string {
  if (source.kind === 'twitch') return paths.headByTwitch(source.channelId)
  if (source.kind === 'slug') return paths.headBySlug(source.slug)
  return paths.headByProfile(source.profileId)
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

/** The streamer has no profile, or hasn't published yet. */
export class NotSetUpError extends Error {
  constructor() {
    super('not set up')
  }
}

// The Worker validates every snapshot on write, so the viewer only checks the
// shape it depends on instead of shipping the zod schemas in the extension bundle.
function isHead(v: unknown): v is StreamHead {
  const h = v as StreamHead
  return !!h && typeof h.profileId === 'string' && Number.isInteger(h.version) && typeof h.state === 'string'
}

function isSnapshot(v: unknown): v is StreamSnapshot {
  const s = v as StreamSnapshot
  return !!s && s.schema === 1 && !!s.character && !!s.equipment && Array.isArray(s.flasks) && Array.isArray(s.skills)
}

export async function fetchHead(source: StreamSource, fetcher: Fetcher = fetch, base = API_BASE): Promise<StreamHead> {
  const res = await fetcher(base + headPath(source))
  if (res.status === 404) throw new NotSetUpError()
  if (!res.ok) throw new Error(`Couldn't reach Scalpel Stream (${res.status})`)
  const head: unknown = await res.json()
  if (!isHead(head)) throw new Error('Scalpel Stream sent an unexpected response')
  return head
}

export async function fetchSnapshot(
  profileId: string,
  version: number,
  fetcher: Fetcher = fetch,
  base = API_BASE,
): Promise<StreamSnapshot> {
  const res = await fetcher(base + paths.snapshotVersion(profileId, version))
  if (res.status === 404) throw new NotSetUpError()
  if (!res.ok) throw new Error(`Couldn't load gear (${res.status})`)
  const snapshot: unknown = await res.json()
  if (!isSnapshot(snapshot)) throw new Error('Scalpel Stream sent unreadable gear')
  return snapshot
}
