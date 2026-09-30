import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeCharacter } from '../normalize'
import { NinjaCharacterSchema } from './ninja-types'
import { createPoeNinjaSource, type SourceFetch, type SourceResponse, SourceError } from './poe-ninja'

const fixtures = resolve(__dirname, '../__fixtures__')
const indexState = JSON.parse(readFileSync(resolve(fixtures, 'ninja-index-state.json'), 'utf8'))
const searchBytes = readFileSync(resolve(fixtures, 'ninja-search.bin'))
const character = JSON.parse(readFileSync(resolve(fixtures, 'ninja-character.json'), 'utf8'))
const profile = JSON.parse(readFileSync(resolve(fixtures, 'ninja-profile.json'), 'utf8'))

function respond(body: unknown, status = 200): SourceResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: null,
    json: async () => body,
    arrayBuffer: async () => {
      const b = body as Buffer
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
    },
  }
}

/** A server-sent events response delivering `chunks` in order, then staying open
 *  (as poe.ninja's streams do) unless `end` is set. Aborting the request errors it. */
function sse(chunks: string[], opts: { end?: boolean; onCancel?: () => void } = {}) {
  return (signal?: AbortSignal): SourceResponse => {
    const encoder = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c))
        if (opts.end) controller.close()
        signal?.addEventListener('abort', () => {
          try {
            controller.error(new DOMException('aborted', 'AbortError'))
          } catch {
            // Already cancelled by the reader.
          }
        })
      },
      cancel: () => opts.onCancel?.(),
    })
    return { ok: true, status: 200, body, json: async () => null, arrayBuffer: async () => new ArrayBuffer(0) }
  }
}

type Route = 'index' | 'search' | 'accountEvents' | 'profile' | 'characterEvents' | 'model'

function fakeNinja(
  overrides: Partial<Record<Route, SourceResponse | ((signal?: AbortSignal) => SourceResponse)>> = {},
) {
  const pick = (route: Route, fallback: () => SourceResponse, signal?: AbortSignal): SourceResponse => {
    const o = overrides[route]
    return typeof o === 'function' ? o(signal) : (o ?? fallback())
  }
  return vi.fn<SourceFetch>(async (url, init) => {
    if (url.includes('/data/index-state')) return pick('index', () => respond(indexState))
    if (url.includes('/search?')) return pick('search', () => respond(searchBytes))
    if (url.includes('/events/characters/'))
      return pick('accountEvents', () => sse(['data: {"version":14}\n\n'])(init?.signal), init?.signal)
    if (url.includes('/events/character/'))
      return pick('characterEvents', () => sse(['data: {"version":182}\n\n'])(init?.signal), init?.signal)
    if (url.includes('/model/')) return pick('model', () => respond({ type: 'found', charModel: character }))
    if (url.includes('/profile/characters/')) return pick('profile', () => respond(profile))
    throw new Error(`unexpected ${url}`)
  })
}

const urls = (fetcher: ReturnType<typeof fakeNinja>) => fetcher.mock.calls.map(([u]) => u)

afterEach(() => vi.useRealTimers())

describe('streamerAccount', () => {
  it("names a listed streamer's account from the streamers snapshot", async () => {
    const fetcher = fakeNinja()
    expect(await createPoeNinjaSource(fetcher).streamerAccount('Aer0__')).toBe('aer0_#2690')
    expect(urls(fetcher).find((u) => u.includes('/search?'))).toContain(
      `/builds/${indexState.snapshotVersions[0].version}/search?streamer=aer0__&overview=streamers`,
    )
  })

  it("never takes another streamer's account when poe.ninja ignores an unlisted login", async () => {
    // For a login it doesn't list, poe.ninja answers with everyone's characters: here, aer0__'s.
    const fetcher = fakeNinja()
    const source = createPoeNinjaSource(fetcher)
    expect(await source.streamerAccount('frederickfarthammer')).toBeNull()
    expect(await source.streamerAccount('frederickfarthammer')).toBeNull()
    expect(urls(fetcher).filter((u) => u.includes('/search?'))).toHaveLength(1)
  })
})

describe('accountCharacters', () => {
  it('lists the profile at the version its events stream announces', async () => {
    const fetcher = fakeNinja()
    const characters = await createPoeNinjaSource(fetcher).accountCharacters('aer0_#2690')
    expect(urls(fetcher)).toEqual([
      'https://poe.ninja/poe2/api/events/characters/aer0_-2690',
      'https://poe.ninja/poe2/api/profile/characters/aer0_-2690/14',
    ])
    expect(characters).toHaveLength(4)
    expect(characters[0]).toEqual({
      account: 'aer0_#2690',
      name: 'GassiusClay',
      league: 'Forbidden Rites',
      leagueUrl: 'forbiddenrites',
      level: 96,
      className: 'Gemling Legionnaire',
      updatedUtc: profile[0].updated,
      isCurrent: true,
    })
    expect(characters.filter((c) => c.isCurrent)).toHaveLength(1)
  })

  it('returns nothing for an account poe.ninja has no profile for', async () => {
    const fetcher = fakeNinja({ accountEvents: sse(['event: notfound\ndata:\n\n'], { end: true }) })
    expect(await createPoeNinjaSource(fetcher).accountCharacters('Nobody#0000')).toEqual([])
    expect(urls(fetcher).some((u) => u.includes('/profile/'))).toBe(false)
  })

  it('refuses an account without a #1234 before asking poe.ninja', async () => {
    const fetcher = fakeNinja()
    await expect(createPoeNinjaSource(fetcher).accountCharacters('TheLinkin')).rejects.toMatchObject({
      kind: 'not-found',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('skips a profile row it cannot read instead of failing the list', async () => {
    const fetcher = fakeNinja({ profile: respond([{ name: 'broken' }, ...profile]) })
    expect(await createPoeNinjaSource(fetcher).accountCharacters('aer0_#2690')).toHaveLength(4)
  })
})

describe('fetchCharacter', () => {
  it('reads the profile model at its own version, with encoded path segments', async () => {
    const fetcher = fakeNinja()
    const ch = await createPoeNinjaSource(fetcher).fetchCharacter({
      account: 'aer0_#2690',
      leagueUrl: 'forbiddenrites',
      name: 'C&D',
    })
    expect(ch.class).toBe('Gemling Legionnaire')
    expect(urls(fetcher)).toEqual([
      'https://poe.ninja/poe2/api/events/character/aer0_-2690/forbiddenrites/C%26D',
      'https://poe.ninja/poe2/api/profile/characters/aer0_-2690/forbiddenrites/C%26D/model/182',
    ])
  })

  it('reads runes and gems the profile model spells with null fields', async () => {
    // The builds fixture as the profile model sends it: absent fields present as null.
    type Loose = Record<string, unknown>
    const nulls = { inventoryId: null, x: null, y: null, mods: null, id: null, stackSize: null, flavourText: null }
    const withNulls = (item: unknown): Loose => ({ ...nulls, ...(item as Loose) })
    const profileStyle = {
      ...character,
      lastSeenUtc: null,
      items: character.items.map((e: { itemData: Loose }) => ({
        ...e,
        itemData: {
          ...e.itemData,
          note: null,
          socketedItems: ((e.itemData.socketedItems as unknown[]) ?? []).map(withNulls),
        },
      })),
      skills: character.skills.map((s: { allGems: { itemData: unknown }[] }) => ({
        ...s,
        allGems: s.allGems.map((g) => ({ ...g, itemData: withNulls(g.itemData) })),
      })),
    }
    const fetcher = fakeNinja({ model: respond({ type: 'found', charModel: profileStyle }) })
    const raw = await createPoeNinjaSource(fetcher).fetchCharacter({
      account: 'aer0_#2690',
      leagueUrl: 'forbiddenrites',
      name: 'GassiusClay',
    })

    const opts = { now: new Date('2026-09-30T12:00:00Z'), hideCharacterName: false }
    const fromProfile = normalizeCharacter(raw, opts).snapshot
    const fromBuilds = normalizeCharacter(NinjaCharacterSchema.parse(character), opts).snapshot
    expect(fromProfile.skills.length).toBeGreaterThan(0)
    expect(fromProfile.skills).toEqual(fromBuilds.skills)
    expect(fromProfile.equipment).toEqual(fromBuilds.equipment)
  })

  it('classifies a missing or unreadable character', async () => {
    const ref = { account: 'aer0_#2690', leagueUrl: 'forbiddenrites', name: 'X' }
    const unknown = createPoeNinjaSource(
      fakeNinja({ characterEvents: sse(['event: notfound\ndata:\n\n'], { end: true }) }),
    )
    await expect(unknown.fetchCharacter(ref)).rejects.toMatchObject({ kind: 'not-found' })

    const notFound = createPoeNinjaSource(fakeNinja({ model: respond({ type: 'notFound' }) }))
    await expect(notFound.fetchCharacter(ref)).rejects.toMatchObject({ kind: 'not-found' })

    const gone = createPoeNinjaSource(fakeNinja({ model: respond({}, 404) }))
    await expect(gone.fetchCharacter(ref)).rejects.toMatchObject({ kind: 'not-found' })

    const changed = createPoeNinjaSource(fakeNinja({ model: respond({ type: 'found', charModel: { nope: true } }) }))
    await expect(changed.fetchCharacter(ref)).rejects.toMatchObject({ kind: 'format' })
  })
})

describe('events streams', () => {
  it('reads past keep-alives, split chunks and CRLF line endings', async () => {
    const fetcher = fakeNinja({ accountEvents: sse([': ping\r\n\r\n', 'data: {"vers', 'ion":321}\r\n\r\n']) })
    await createPoeNinjaSource(fetcher).accountCharacters('aer0_#2690')
    expect(urls(fetcher)).toContain('https://poe.ninja/poe2/api/profile/characters/aer0_-2690/321')
  })

  it('hangs up once it has the version', async () => {
    let cancelled = false
    const fetcher = fakeNinja({
      accountEvents: sse(['data: {"version":14}\n\n'], { onCancel: () => (cancelled = true) }),
    })
    await createPoeNinjaSource(fetcher).accountCharacters('aer0_#2690')
    expect(cancelled).toBe(true)
  })

  it('treats a stream that closes without a version as a format change', async () => {
    const fetcher = fakeNinja({ accountEvents: sse([': ping\n\n'], { end: true }) })
    await expect(createPoeNinjaSource(fetcher).accountCharacters('aer0_#2690')).rejects.toMatchObject({
      kind: 'format',
    })
  })

  it('gives up on a silent stream after a while', async () => {
    vi.useFakeTimers()
    const fetcher = fakeNinja({ accountEvents: sse([]) })
    const pending = createPoeNinjaSource(fetcher).accountCharacters('aer0_#2690')
    const settled = expect(pending).rejects.toMatchObject({ kind: 'network' })
    await vi.advanceTimersByTimeAsync(10_000)
    await settled
  })

  it('classifies network failures', async () => {
    const offline = createPoeNinjaSource(async () => {
      throw new Error('ENOTFOUND')
    })
    await expect(offline.accountCharacters('aer0_#2690')).rejects.toBeInstanceOf(SourceError)
    await expect(offline.accountCharacters('aer0_#2690')).rejects.toMatchObject({ kind: 'network' })

    const down = createPoeNinjaSource(fakeNinja({ accountEvents: respond(null, 503) }))
    await expect(down.accountCharacters('aer0_#2690')).rejects.toMatchObject({ kind: 'network' })

    const badSearch = createPoeNinjaSource(fakeNinja({ search: respond(Buffer.from('<html>')) }))
    await expect(badSearch.streamerAccount('x')).rejects.toMatchObject({ kind: 'format' })
  })
})
