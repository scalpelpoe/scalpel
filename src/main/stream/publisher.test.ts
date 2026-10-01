import sample from '@scalpel/stream-contract/fixtures/sample-snapshot.json'
import { LIMITS, type SnapshotItem, type StreamSnapshot } from '@scalpel/stream-contract'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreamApiError, type StreamClient } from './client'
import {
  CHECK_INTERVAL_MS,
  createPublisher,
  fitSnapshot,
  MIN_PUSH_GAP_MS,
  PATCH_TTL_MS,
  type PublisherDeps,
  type PublisherStatus,
  type StreamPrefs,
} from './publisher'
import type { NinjaCharacter } from './sources/ninja-types'
import type { PoeNinjaSource, ProfileCharacter } from './sources/poe-ninja'

const base = sample as StreamSnapshot

function profileCharacter(updatedUtc: string, patch: Partial<ProfileCharacter> = {}): ProfileCharacter {
  return {
    account: 'aer0_#2690',
    name: 'GassiusClay',
    league: 'Forbidden Rites',
    leagueUrl: 'forbiddenrites',
    level: 95,
    className: 'Gemling Legionnaire',
    updatedUtc,
    isCurrent: true,
    ...patch,
  }
}

function character(updatedUtc: string, name = 'GassiusClay'): NinjaCharacter {
  return {
    account: 'aer0_-2690',
    name,
    league: 'Forbidden Rites',
    level: 95,
    class: 'Gemling Legionnaire',
    items: [],
    flasks: [],
    jewels: [],
    skills: [],
    keystones: [],
    pathOfBuildingExport: null,
    useSecondWeaponSet: false,
    updatedUtc,
  }
}

function setup(overrides: Partial<PublisherDeps> = {}, prefs: Partial<StreamPrefs> = {}) {
  let updatedUtc = '2026-09-29T10:00:00Z'
  let ringName = 'Blood Band'
  const statuses: PublisherStatus[] = []
  const source = {
    streamerAccount: vi.fn<PoeNinjaSource['streamerAccount']>(async () => null),
    accountCharacters: vi.fn<PoeNinjaSource['accountCharacters']>(async () => [profileCharacter(updatedUtc)]),
    fetchCharacter: vi.fn<PoeNinjaSource['fetchCharacter']>(async (ref) => character(updatedUtc, ref.name)),
  }
  let pushes = 0
  const client = {
    putSnapshot: vi.fn<StreamClient['putSnapshot']>(async () => ({ version: ++pushes })),
  }
  const currentPrefs: StreamPrefs = {
    enabled: true,
    profileId: 'p1',
    poeAccount: 'aer0_#2690',
    pinnedCharacter: null,
    hideCharacterName: false,
    linkItemFilters: true,
    buildGuideUrl: '',
    ...prefs,
  }
  const gameActive = { value: true }
  const publisher = createPublisher({
    source,
    client: client as unknown as StreamClient,
    build: (raw) => {
      const snapshot = structuredClone(base)
      snapshot.source = { kind: 'test', updatedUtc: new Date(raw.updatedUtc).toISOString() }
      if (snapshot.equipment.Ring2) snapshot.equipment.Ring2.name = ringName
      return { snapshot, warnings: [] }
    },
    getPrefs: () => currentPrefs,
    getToken: async () => 'tok',
    isGameActive: () => gameActive.value,
    onStatus: (s) => statuses.push(s),
    ...overrides,
  })
  return {
    publisher,
    source,
    client,
    statuses,
    prefs: currentPrefs,
    gameActive,
    setUpdated: (v: string) => {
      updatedUtc = v
    },
    setRing: (v: string) => {
      ringName = v
    },
    pushed: () => client.putSnapshot.mock.calls.map(([, , s]) => s),
  }
}

const settle = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('createPublisher', () => {
  it('stays off while disabled and waits for PoE2 when enabled', async () => {
    const off = setup({}, { enabled: false })
    off.publisher.start()
    await settle()
    expect(off.publisher.getStatus().phase).toBe('off')
    expect(off.source.fetchCharacter).not.toHaveBeenCalled()

    const waiting = setup()
    waiting.gameActive.value = false
    waiting.publisher.start()
    await settle()
    expect(waiting.publisher.getStatus().phase).toBe('waiting-for-game')
    expect(waiting.source.fetchCharacter).not.toHaveBeenCalled()
  })

  it('publishes the current character, then only when poe.ninja changes it', async () => {
    const t = setup()
    t.publisher.start()
    await settle()
    expect(t.source.accountCharacters).toHaveBeenCalledWith('aer0_#2690')
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(1)
    expect(t.publisher.getStatus()).toMatchObject({
      phase: 'idle',
      version: 1,
      character: { name: 'GassiusClay', league: 'Forbidden Rites', level: 95 },
      sourceUpdatedUtc: '2026-09-29T10:00:00.000Z',
    })

    // The profile shows the same update time: no character download, no push.
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(t.source.accountCharacters).toHaveBeenCalledTimes(2)
    expect(t.source.fetchCharacter).toHaveBeenCalledTimes(1)
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(1)

    t.setUpdated('2026-09-29T11:00:00Z')
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(t.source.fetchCharacter).toHaveBeenCalledTimes(2)
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(2)
  })

  it('follows the character poe.ninja marks current unless one is pinned', async () => {
    const list = [
      profileCharacter('2026-09-29T11:00:00Z', { name: 'Newer', isCurrent: false }),
      profileCharacter('2026-09-29T10:00:00Z', { name: 'Playing', isCurrent: true }),
      profileCharacter('2026-09-20T10:00:00Z', { name: 'Alt', leagueUrl: 'standard', isCurrent: false }),
    ]
    const t = setup()
    t.source.accountCharacters.mockResolvedValue(list)
    t.publisher.start()
    await settle()
    expect(t.source.fetchCharacter).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Playing' }))

    const pinned = setup({}, { pinnedCharacter: { account: 'aer0_#2690', name: 'Alt' } })
    pinned.source.accountCharacters.mockResolvedValue(list)
    pinned.publisher.start()
    await settle()
    expect(pinned.source.fetchCharacter).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Alt', leagueUrl: 'standard' }),
    )

    const none = setup()
    none.source.accountCharacters.mockResolvedValue(list.map((c) => ({ ...c, isCurrent: false })))
    none.publisher.start()
    await settle()
    expect(none.source.fetchCharacter).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Newer' }))
  })

  it('says when a pinned character left the profile', async () => {
    const t = setup({}, { pinnedCharacter: { account: 'aer0_#2690', name: 'Deleted' } })
    t.publisher.start()
    await settle()
    expect(t.publisher.getStatus().error).toMatch(/Deleted isn't on aer0_#2690's poe.ninja profile/)
  })

  it('pushes on demand even when nothing changed, respecting the push gap', async () => {
    const t = setup()
    t.publisher.start()
    await settle()
    const forced = t.publisher.pushNow()
    await vi.advanceTimersByTimeAsync(MIN_PUSH_GAP_MS - 1)
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await forced
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(2)
  })

  it('republishes when the streamer toggles the hidden name', async () => {
    const t = setup()
    t.publisher.start()
    await settle()
    t.prefs.hideCharacterName = true
    t.publisher.refresh()
    await vi.advanceTimersByTimeAsync(MIN_PUSH_GAP_MS)
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(2)
  })

  it('publishes the filters and build guide links from the current prefs', async () => {
    const t = setup({}, { buildGuideUrl: 'https://youtu.be/abc' })
    t.publisher.start()
    await settle()
    expect(t.pushed()[0].links).toEqual({
      filters: 'https://www.pathofexile.com/account/view-profile/aer0_-2690/item-filters',
      buildGuide: 'https://youtu.be/abc',
    })
  })

  it('republishes when the links change and drops the filters link when turned off', async () => {
    const t = setup()
    t.publisher.start()
    await settle()
    t.prefs.linkItemFilters = false
    t.publisher.refresh()
    await vi.advanceTimersByTimeAsync(MIN_PUSH_GAP_MS)
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(2)
    expect(t.pushed()[1].links).toEqual({ filters: null, buildGuide: null })
  })

  it('backs off on failures and resets after a success', async () => {
    const t = setup()
    t.source.fetchCharacter.mockRejectedValueOnce(new Error('poe.ninja unreachable'))
    t.source.fetchCharacter.mockRejectedValueOnce(new Error('poe.ninja unreachable'))
    t.publisher.start()
    await settle()
    expect(t.publisher.getStatus()).toMatchObject({ phase: 'error', error: 'poe.ninja unreachable' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(t.source.fetchCharacter).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(119_999)
    expect(t.source.fetchCharacter).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(t.publisher.getStatus().phase).toBe('idle')
  })

  it('waits out a 429 Retry-After', async () => {
    const t = setup()
    t.client.putSnapshot.mockRejectedValueOnce(new StreamApiError('rate limited', 429, 300))
    t.publisher.start()
    await settle()
    expect(t.publisher.getStatus().phase).toBe('error')
    await vi.advanceTimersByTimeAsync(299_000)
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(2)
  })

  it('reports missing setup instead of throwing', async () => {
    const t = setup({}, { poeAccount: '' })
    t.publisher.start()
    await settle()
    expect(t.publisher.getStatus().error).toMatch(/Enter your Path of Exile account/)

    const bad = setup({}, { poeAccount: 'TheLinkin' })
    bad.publisher.start()
    await settle()
    expect(bad.publisher.getStatus().error).toMatch(/Accounts look like Name#1234/)
    expect(bad.source.accountCharacters).not.toHaveBeenCalled()

    const unknown = setup()
    unknown.source.accountCharacters.mockResolvedValue([])
    unknown.publisher.start()
    await settle()
    expect(unknown.publisher.getStatus().error).toMatch(/poe.ninja has no profile for aer0_#2690/)
  })

  it('trims oversized price checks on the wire without touching retained base or patch items', async () => {
    const huge = (): SnapshotItem['priceCheck'] => ({
      league: 'Standard',
      body: { pad: 'x'.repeat(300_000) },
      rows: [],
    })
    const t = setup({
      build: (raw) => {
        const snapshot = structuredClone(base)
        snapshot.source = { kind: 'test', updatedUtc: new Date(raw.updatedUtc).toISOString() }
        if (snapshot.equipment.Helm) snapshot.equipment.Helm.priceCheck = huge()
        return { snapshot, warnings: [] }
      },
    })
    t.publisher.start()
    await settle()
    expect(t.pushed()[0].equipment.Helm?.priceCheck).toBeUndefined()
    expect(t.publisher.currentSnapshot()?.equipment.Helm?.priceCheck).toBeDefined()

    const patchItem: SnapshotItem = { ...structuredClone(base.equipment.Ring2 as SnapshotItem), priceCheck: huge() }
    const applied = t.publisher.applyPatch('Ring2', patchItem)
    await vi.advanceTimersByTimeAsync(MIN_PUSH_GAP_MS)
    await applied
    expect(t.pushed()[1].equipment.Ring2?.priceCheck).toBeUndefined()
    expect(patchItem.priceCheck).toBeDefined()
    expect(t.publisher.currentSnapshot()?.equipment.Helm?.priceCheck).toBeDefined()
  })

  it('shows hotkey patches until poe.ninja catches up', async () => {
    const t = setup()
    t.publisher.start()
    await settle()
    const patchItem: SnapshotItem = { ...structuredClone(base.equipment.Ring2 as SnapshotItem), name: 'Fresh Ring' }
    const applied = t.publisher.applyPatch('Ring2', patchItem)
    await vi.advanceTimersByTimeAsync(MIN_PUSH_GAP_MS)
    await applied
    const patched = t.pushed()[1]
    expect(patched.equipment.Ring2?.name).toBe('Fresh Ring')
    expect(patched.patches).toEqual([{ slot: 'Ring2', atUtc: expect.any(String) }])
    expect(t.publisher.getStatus().patchedSlots).toEqual(['Ring2'])

    // poe.ninja refreshes but still shows the old ring: keep the patch.
    t.setUpdated('2026-09-29T11:00:00Z')
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(t.pushed()[2].equipment.Ring2?.name).toBe('Fresh Ring')

    // poe.ninja now shows a different ring there: the patch is dropped.
    t.setRing('Fresh Ring')
    t.setUpdated('2026-09-29T12:00:00Z')
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    expect(t.pushed()[3].patches).toEqual([])
    expect(t.publisher.getStatus().patchedSlots).toEqual([])
  })

  it('honours Push now while another check is in flight', async () => {
    const t = setup()
    t.publisher.start()
    await settle()
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(1)

    // The next scheduled check stalls on poe.ninja and finds nothing new...
    let release: () => void = () => {}
    t.source.accountCharacters.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve([profileCharacter('2026-09-29T10:00:00Z')])
        }),
    )
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS)
    // ...but a forced push requested meanwhile must still publish.
    const forced = t.publisher.pushNow()
    release()
    await vi.advanceTimersByTimeAsync(MIN_PUSH_GAP_MS)
    await forced
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(2)
  })

  it('never lets a slower automatic push overwrite a hotkey patch', async () => {
    const t = setup()
    t.publisher.start()
    await settle()

    // What the server ends up with is whichever upload LANDS last, not the last one sent.
    const landed: StreamSnapshot[] = []
    t.client.putSnapshot.mockImplementation(async (_id, _token, snapshot) => {
      landed.push(snapshot)
      return { version: landed.length }
    })
    t.setUpdated('2026-09-29T11:00:00Z')
    let finishSlowPush: () => void = () => {}
    t.client.putSnapshot.mockImplementationOnce(
      (_id, _token, snapshot) =>
        new Promise((resolve) => {
          finishSlowPush = () => {
            landed.push(snapshot)
            resolve({ version: landed.length })
          }
        }),
    )
    await vi.advanceTimersByTimeAsync(CHECK_INTERVAL_MS) // automatic push now in flight
    const patchItem: SnapshotItem = { ...structuredClone(base.equipment.Ring2 as SnapshotItem), name: 'Hotkey Ring' }
    const applied = t.publisher.applyPatch('Ring2', patchItem)
    await vi.advanceTimersByTimeAsync(0)
    finishSlowPush()
    await vi.advanceTimersByTimeAsync(MIN_PUSH_GAP_MS)
    await applied
    expect(landed.at(-1)?.equipment.Ring2?.name).toBe('Hotkey Ring')
  })

  it('drops an expired hotkey patch even when poe.ninja has nothing new', async () => {
    const t = setup()
    t.publisher.start()
    await settle()
    const applied = t.publisher.applyPatch('Ring2', {
      ...structuredClone(base.equipment.Ring2 as SnapshotItem),
      name: 'Fresh Ring',
    })
    await vi.advanceTimersByTimeAsync(MIN_PUSH_GAP_MS)
    await applied
    expect(t.publisher.getStatus().patchedSlots).toEqual(['Ring2'])

    await vi.advanceTimersByTimeAsync(PATCH_TTL_MS + CHECK_INTERVAL_MS)
    expect(t.pushed().at(-1)?.patches).toEqual([])
    expect(t.publisher.getStatus().patchedSlots).toEqual([])
  })

  it('refuses patches before the first publish', async () => {
    const t = setup({}, { enabled: false })
    await expect(t.publisher.applyPatch('Ring', base.equipment.Ring as SnapshotItem)).rejects.toThrow(/not published/)
  })
})

describe('fitSnapshot', () => {
  const bytes = (s: StreamSnapshot) => Buffer.byteLength(JSON.stringify(s), 'utf8')
  const withPc = (item: SnapshotItem, pad: number): SnapshotItem => ({
    ...item,
    priceCheck: { league: 'Standard', body: { pad: 'x'.repeat(pad) }, rows: [] },
  })

  it('drops the largest price checks first and stops once it fits', () => {
    const snap = structuredClone(base)
    const helm = snap.equipment.Helm as SnapshotItem
    const ring = snap.equipment.Ring as SnapshotItem
    snap.equipment.Helm = withPc(helm, 3000)
    snap.equipment.Ring = withPc(ring, 9000)
    snap.other = [withPc(helm, 6000)]
    const limit = bytes(snap) - 5000
    fitSnapshot(snap, limit)
    expect(snap.equipment.Ring?.priceCheck).toBeUndefined()
    expect(snap.other[0].priceCheck).toBeDefined()
    expect(snap.equipment.Helm?.priceCheck).toBeDefined()
    expect(bytes(snap)).toBeLessThanOrEqual(limit)
  })

  it('leaves a snapshot that already fits untouched', () => {
    const snap = structuredClone(base)
    snap.equipment.Helm = withPc(snap.equipment.Helm as SnapshotItem, 100)
    fitSnapshot(snap, 10_000_000)
    expect(snap.equipment.Helm.priceCheck).toBeDefined()
  })

  it('measures bytes, not characters', () => {
    const snap = structuredClone(base)
    snap.equipment.Helm = withPc(snap.equipment.Helm as SnapshotItem, 0)
    snap.equipment.Helm.priceCheck!.body = { pad: '€'.repeat(2000) }
    const limit = bytes(snap) - 1
    expect(JSON.stringify(snap).length).toBeLessThan(limit)
    fitSnapshot(snap, limit)
    expect(snap.equipment.Helm.priceCheck).toBeUndefined()
  })
})

describe('fitSnapshot card shedding', () => {
  const bytes = (s: StreamSnapshot) => Buffer.byteLength(JSON.stringify(s), 'utf8')
  const card = (pad: number) => ({
    name: 'X',
    baseType: 'X',
    rarity: 'gem' as const,
    icon: 'https://web.poecdn.com/x.png',
    properties: [],
    requirements: [],
    sections: [
      {
        kind: 'description' as const,
        lines: Array.from({ length: Math.ceil(pad / 1000) }, () => ({ text: 'y'.repeat(1000) })),
      },
    ],
  })
  const loaded = (): StreamSnapshot => {
    const snap = structuredClone(base)
    snap.skills = [
      {
        gem: { name: 'G', icon: null, level: 1, quality: 0, card: card(3000) },
        supports: [
          { name: 'S1', icon: null, card: card(2000) },
          { name: 'S2', icon: null, card: card(4000) },
        ],
      },
    ]
    const helm = snap.equipment.Helm as SnapshotItem
    helm.sockets = [{ kind: 'rune', name: 'R', icon: null, card: card(1500) }]
    helm.priceCheck = { league: 'Standard', body: { pad: 'x'.repeat(5000) }, rows: [] }
    return snap
  }

  it('sheds support cards before gem cards before price checks, largest first', () => {
    const snap = loaded()
    fitSnapshot(snap, bytes(snap) - 3000)
    expect(snap.skills[0].supports[1].card).toBeUndefined()
    expect(snap.skills[0].supports[0].card).toBeDefined()
    expect(snap.skills[0].gem.card).toBeDefined()
    const snap2 = loaded()
    fitSnapshot(snap2, bytes(snap2) - 7500)
    expect(snap2.skills[0].supports.every((s) => !s.card)).toBe(true)
    expect(snap2.skills[0].gem.card).toBeUndefined()
    expect((snap2.equipment.Helm as SnapshotItem).sockets[0].card).toBeDefined()
    expect((snap2.equipment.Helm as SnapshotItem).priceCheck).toBeDefined()
  })

  it('sheds everything when needed and the snapshot still publishes', () => {
    const snap = loaded()
    const stripped = structuredClone(snap)
    fitSnapshot(snap, bytes(base))
    expect(snap.skills[0].supports.every((s) => !s.card)).toBe(true)
    expect(snap.skills[0].gem.card).toBeUndefined()
    expect((snap.equipment.Helm as SnapshotItem).sockets[0].card).toBeUndefined()
    expect((snap.equipment.Helm as SnapshotItem).priceCheck).toBeUndefined()
    expect(bytes(snap)).toBeLessThan(bytes(stripped))
  })

  it('publishes an oversized snapshot with cards shed and leaves the retained base untouched', async () => {
    const huge = (): StreamSnapshot => {
      const snap = loaded()
      const fat = {
        ...card(0),
        sections: [
          { kind: 'description' as const, lines: Array.from({ length: 40 }, () => ({ text: 'z'.repeat(2000) })) },
        ],
      }
      snap.skills[0].supports = [1, 2, 3, 4].map((n) => ({ name: `S${n}`, icon: null, card: fat }))
      return snap
    }
    const t = setup({
      build: (raw) => ({
        snapshot: { ...huge(), source: { kind: 'test', updatedUtc: new Date(raw.updatedUtc).toISOString() } },
        warnings: [],
      }),
    })
    t.publisher.start()
    await settle()
    expect(t.client.putSnapshot).toHaveBeenCalledTimes(1)
    const sent = t.pushed()[0]
    expect(bytes(sent)).toBeLessThanOrEqual(LIMITS.snapshotBytes)
    expect(sent.skills[0].supports.some((s) => !s.card)).toBe(true)
    expect(sent.skills[0].gem.card).toBeDefined()
    expect(t.publisher.getStatus().phase).toBe('idle')
    expect(t.publisher.currentSnapshot()?.skills[0].supports.every((s) => s.card)).toBe(true)
  })
})
