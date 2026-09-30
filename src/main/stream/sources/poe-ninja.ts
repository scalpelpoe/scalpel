import { ninjaAccountKey, normalizePoeAccount } from '@shared/poe-account'
import { parseStreamerSearch } from './ninja-search'
import {
  type NinjaCharacter,
  NinjaCharacterModelSchema,
  NinjaIndexStateSchema,
  NinjaProfileSchema,
} from './ninja-types'

/** poe.ninja's PoE2 endpoints, used with the operator's permission (see
 *  THIRD-PARTY-NOTICES.md). Each streamer's Scalpel reads only that streamer's
 *  account. Profile responses are cached for a year per version, so every read
 *  first asks the matching events stream for the current version, the way
 *  poe.ninja's own profile page does. */
export const POE_NINJA_POE2 = 'https://poe.ninja/poe2/api'

export interface SourceResponse {
  ok: boolean
  status: number
  body: ReadableStream<Uint8Array> | null
  json(): Promise<unknown>
  arrayBuffer(): Promise<ArrayBuffer>
}

export type SourceFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<SourceResponse>

export class SourceError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'not-found' | 'format',
  ) {
    super(message)
  }
}

/** A character on an account's poe.ninja profile. */
export interface ProfileCharacter {
  /** "Name#1234". */
  account: string
  name: string
  /** League display name, e.g. "Forbidden Rites". */
  league: string
  /** poe.ninja's league key, e.g. "forbiddenrites". */
  leagueUrl: string
  level: number | null
  className: string | null
  updatedUtc: string
  /** The character poe.ninja last saw the account play. */
  isCurrent: boolean
}

export type CharacterRef = Pick<ProfileCharacter, 'account' | 'leagueUrl' | 'name'>

const HOUR = 60 * 60 * 1000
const EVENTS_TIMEOUT_MS = 10_000
const enc = encodeURIComponent

export interface PoeNinjaSource {
  /** The account ("Name#1234") poe.ninja ties a listed streamer's Twitch login to, or
   *  null when poe.ninja doesn't list the channel. */
  streamerAccount(twitchLogin: string): Promise<string | null>
  /** Every character on the account's poe.ninja profile; empty when it has no profile. */
  accountCharacters(account: string): Promise<ProfileCharacter[]>
  fetchCharacter(ref: CharacterRef): Promise<NinjaCharacter>
}

/** One server-sent event's name and joined data lines. */
function parseEvent(block: string): { event: string; data: string } {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return { event, data: data.join('\n') }
}

/** The profile model spells an absent field `null` (socketed runes and gems carry
 *  `inventoryId`, `x`, `y`, `mods`... as null) where the builds endpoints leave it out.
 *  Dropping those lets one schema read both; array slots stay put. */
function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) if (v !== null) out[k] = dropNulls(v)
    return out
  }
  return value
}

function accountKey(account: string): string {
  const key = ninjaAccountKey(account)
  if (!key)
    throw new SourceError(`${account} isn't a Path of Exile account; accounts look like Name#1234.`, 'not-found')
  return key
}

export function createPoeNinjaSource(fetcher: SourceFetch, now: () => number = Date.now): PoeNinjaSource {
  let version: { value: string; at: number } | null = null
  const streamers = new Map<string, { account: string | null; at: number }>()

  async function get(url: string, init?: { signal?: AbortSignal }): Promise<SourceResponse> {
    let res: SourceResponse
    try {
      res = await fetcher(url, init)
    } catch (e) {
      throw new SourceError(`poe.ninja unreachable: ${(e as Error).message}`, 'network')
    }
    if (res.status === 404) throw new SourceError('poe.ninja has no such character', 'not-found')
    if (!res.ok) throw new SourceError(`poe.ninja answered ${res.status}`, 'network')
    return res
  }

  async function readJson(res: SourceResponse, what: string): Promise<unknown> {
    try {
      return await res.json()
    } catch {
      throw new SourceError(`poe.ninja ${what} format changed`, 'format')
    }
  }

  async function streamersVersion(): Promise<string> {
    if (version && now() - version.at < HOUR) return version.value
    const parsed = NinjaIndexStateSchema.safeParse(
      await readJson(await get(`${POE_NINJA_POE2}/data/index-state`), 'index'),
    )
    const entry = parsed.success ? parsed.data.snapshotVersions.find((s) => s.url === 'streamers') : undefined
    if (!entry) throw new SourceError('poe.ninja index-state has no streamers snapshot', 'format')
    version = { value: entry.version, at: now() }
    return entry.version
  }

  /** The current version from one of poe.ninja's events streams, or null when it calls
   *  the account or character unknown. Reads the first event, then hangs up. */
  async function eventsVersion(path: string): Promise<number | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), EVENTS_TIMEOUT_MS)
    try {
      const res = await get(`${POE_NINJA_POE2}/events/${path}`, { signal: controller.signal })
      if (!res.body) throw new SourceError('poe.ninja events stream sent nothing', 'format')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) throw new SourceError('poe.ninja events stream closed without a version', 'format')
        text += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
        for (let end = text.indexOf('\n\n'); end >= 0; end = text.indexOf('\n\n')) {
          const { event, data } = parseEvent(text.slice(0, end))
          text = text.slice(end + 2)
          if (event === 'notfound') return null
          if (!data) continue // keep-alive
          let v: unknown
          try {
            v = (JSON.parse(data) as { version?: unknown }).version
          } catch {
            v = undefined
          }
          if (!Number.isInteger(v)) throw new SourceError('poe.ninja events stream format changed', 'format')
          void reader.cancel().catch(() => undefined)
          return v as number
        }
      }
    } catch (e) {
      if (e instanceof SourceError) throw e
      if (controller.signal.aborted) throw new SourceError('poe.ninja did not answer in time', 'network')
      throw new SourceError(`poe.ninja unreachable: ${(e as Error).message}`, 'network')
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }

  return {
    async streamerAccount(twitchLogin) {
      const key = twitchLogin.trim().toLowerCase()
      if (!key) return null
      const hit = streamers.get(key)
      if (hit && now() - hit.at < HOUR) return hit.account
      const v = await streamersVersion()
      const res = await get(`${POE_NINJA_POE2}/builds/${enc(v)}/search?streamer=${enc(key)}&overview=streamers`)
      let rows: ReturnType<typeof parseStreamerSearch>
      try {
        rows = parseStreamerSearch(new Uint8Array(await res.arrayBuffer()))
      } catch (e) {
        throw new SourceError(`poe.ninja search format changed: ${(e as Error).message}`, 'format')
      }
      // poe.ninja drops a streamer filter it doesn't recognise and answers with every
      // streamer's characters, so only a row naming this channel counts.
      const own = rows.find((r) => r.streamer === key)
      const account = own ? normalizePoeAccount(own.account) : null
      streamers.set(key, { account, at: now() })
      return account
    },

    async accountCharacters(account) {
      const key = accountKey(account)
      const v = await eventsVersion(`characters/${enc(key)}`)
      if (v === null) return []
      let body: unknown
      try {
        body = await readJson(await get(`${POE_NINJA_POE2}/profile/characters/${enc(key)}/${v}`), 'profile')
      } catch (e) {
        if (e instanceof SourceError && e.kind === 'not-found') return []
        throw e
      }
      const parsed = NinjaProfileSchema.safeParse(body)
      if (!parsed.success) throw new SourceError('poe.ninja profile format changed', 'format')
      return parsed.data.flatMap((c) =>
        c
          ? [
              {
                account: normalizePoeAccount(c.accountName),
                name: c.name,
                league: c.league,
                leagueUrl: c.leagueUrl,
                level: c.level ?? null,
                className: c.className ?? null,
                updatedUtc: c.updated,
                isCurrent: c.isCurrent,
              },
            ]
          : [],
      )
    },

    async fetchCharacter(ref) {
      const path = `${enc(accountKey(ref.account))}/${enc(ref.leagueUrl)}/${enc(ref.name)}`
      const v = await eventsVersion(`character/${path}`)
      if (v === null) throw new SourceError('poe.ninja has no such character', 'not-found')
      const body = await readJson(await get(`${POE_NINJA_POE2}/profile/characters/${path}/model/${v}`), 'character')
      const parsed = NinjaCharacterModelSchema.safeParse(dropNulls(body))
      if (!parsed.success) throw new SourceError('poe.ninja character format changed', 'format')
      if (parsed.data.type !== 'found' || !parsed.data.charModel) {
        throw new SourceError('poe.ninja has no such character', 'not-found')
      }
      return parsed.data.charModel
    },
  }
}
