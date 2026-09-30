import { type Slot, type SnapshotItem, type StreamSnapshot, validateSnapshot } from '@scalpel/stream-contract'
import type { StreamPublisherStatus, StreamSettings } from '@shared/contracts/stream'
import { StreamApiError, type StreamClient } from './client'
import { ninjaAccountKey } from '@shared/poe-account'
import type { PoeNinjaSource, ProfileCharacter } from './sources/poe-ninja'
import type { NinjaCharacter } from './sources/ninja-types'

export type StreamPrefs = StreamSettings
export type PublisherStatus = StreamPublisherStatus

export interface PublisherDeps {
  source: PoeNinjaSource
  client: StreamClient
  /** Normalize + enrich a source character into a snapshot. */
  build: (raw: NinjaCharacter, hideCharacterName: boolean) => { snapshot: StreamSnapshot; warnings: string[] }
  getPrefs: () => StreamPrefs
  getToken: () => Promise<string | null>
  /** True while PoE2 is running with Scalpel attached. */
  isGameActive: () => boolean
  onStatus: (status: PublisherStatus) => void
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export const CHECK_INTERVAL_MS = 10 * 60 * 1000
export const MIN_PUSH_GAP_MS = 10 * 1000
export const MAX_BACKOFF_MS = 30 * 60 * 1000
export const PATCH_TTL_MS = 3 * 60 * 60 * 1000

interface Patch {
  slot: Slot
  item: SnapshotItem
  at: number
  /** Identity of the item the patch replaced; once the source shows something else there, it caught up. */
  replaced: string | null
}

function itemKey(item: SnapshotItem | undefined): string | null {
  if (!item) return null
  return [item.name, item.baseType, ...item.sections.flatMap((s) => s.lines.map((l) => l.text))].join('|')
}

export interface Publisher {
  start(): void
  stop(): void
  /** Re-run now (settings changed, game attached). */
  refresh(): void
  /** Fetch and push even if nothing changed. */
  pushNow(): Promise<void>
  /** Show a hotkey-captured item in a slot until the source catches up. */
  applyPatch(slot: Slot, item: SnapshotItem): Promise<void>
  getStatus(): PublisherStatus
  /** The last source snapshot (unpatched), or null before the first publish. */
  currentSnapshot(): StreamSnapshot | null
}

export function createPublisher(deps: PublisherDeps): Publisher {
  const now = deps.now ?? Date.now
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  let status: PublisherStatus = {
    phase: 'off',
    character: null,
    lastPushUtc: null,
    sourceUpdatedUtc: null,
    version: null,
    error: null,
    warnings: [],
    patchedSlots: [],
  }
  let timer: unknown = null
  /** Every publish (cycles, forced pushes, hotkey patches) runs through one serial
   *  queue, so PUTs never overlap and each is built from the state current when it
   *  runs rather than when it was requested. */
  let tail: Promise<void> = Promise.resolve()
  /** A cycle queued but not started yet. Later requests fold into it (a forced
   *  request upgrades it) instead of stacking duplicate cycles. */
  let waiting: { force: boolean; done: Promise<void> } | null = null
  let failures = 0
  let lastPushAt = 0
  let lastPushed: { key: string; updatedUtc: string; hideName: boolean } | null = null
  /** The last source snapshot, unpatched, so patches can be re-applied without a refetch. */
  let base: StreamSnapshot | null = null
  let patches: Patch[] = []
  let stopped = true

  function update(next: Partial<PublisherStatus>): void {
    status = { ...status, ...next, patchedSlots: patches.map((p) => p.slot) }
    deps.onStatus(status)
  }

  function schedule(ms: number): void {
    if (timer !== null) clearTimer(timer)
    timer = stopped ? null : setTimer(() => void kick(false), ms)
  }

  /** The published patch list is always exactly the live patches. */
  function withPatches(snapshot: StreamSnapshot): StreamSnapshot {
    if (patches.length === 0) return snapshot.patches.length === 0 ? snapshot : { ...snapshot, patches: [] }
    const out: StreamSnapshot = structuredClone(snapshot)
    for (const p of patches) out.equipment[p.slot] = p.item
    out.patches = patches.map((p) => ({ slot: p.slot, atUtc: new Date(p.at).toISOString() }))
    out.publishedUtc = new Date(now()).toISOString()
    return out
  }

  /** Drop patches the source has caught up with, or that are too old to trust. */
  function prunePatches(fresh: StreamSnapshot): void {
    patches = patches.filter((p) => now() - p.at < PATCH_TTL_MS && itemKey(fresh.equipment[p.slot]) === p.replaced)
  }

  /** The pinned character, else the one poe.ninja marks current on the account's profile. */
  async function resolveCharacter(prefs: StreamPrefs): Promise<ProfileCharacter> {
    const account = prefs.poeAccount.trim()
    if (!account) {
      throw new Error('Enter your Path of Exile account (Name#1234) so Scalpel can find your characters on poe.ninja.')
    }
    if (!ninjaAccountKey(account))
      throw new Error(`${account} isn't a Path of Exile account. Accounts look like Name#1234.`)
    const characters = await deps.source.accountCharacters(account)
    if (characters.length === 0) {
      throw new Error(
        `poe.ninja has no profile for ${account} yet. It adds accounts that are on the ladder or have logged in on poe.ninja.`,
      )
    }
    const pin = prefs.pinnedCharacter
    if (pin) {
      const pinned = characters.find((c) => c.name === pin.name)
      if (!pinned)
        throw new Error(`${pin.name} isn't on ${account}'s poe.ninja profile any more. Pick another character.`)
      return pinned
    }
    const newest = [...characters].sort((a, b) => Date.parse(b.updatedUtc) - Date.parse(a.updatedUtc))[0]
    return characters.find((c) => c.isCurrent) ?? newest
  }

  async function push(snapshot: StreamSnapshot, profileId: string, token: string): Promise<void> {
    const check = validateSnapshot(snapshot)
    if (!check.ok) throw new Error(`Snapshot failed validation: ${check.issues.slice(0, 3).join('; ')}`)
    const wait = lastPushAt + MIN_PUSH_GAP_MS - now()
    if (wait > 0) await new Promise<void>((resolve) => setTimer(resolve, wait))
    const { version } = await deps.client.putSnapshot(profileId, token, snapshot)
    lastPushAt = now()
    update({ version, lastPushUtc: new Date(lastPushAt).toISOString() })
  }

  async function cycle(force: boolean): Promise<void> {
    const prefs = deps.getPrefs()
    if (!prefs.enabled || !prefs.profileId) {
      update({ phase: 'off', error: null })
      return schedule(CHECK_INTERVAL_MS)
    }
    if (!force && !deps.isGameActive()) {
      update({ phase: 'waiting-for-game', error: null })
      return schedule(CHECK_INTERVAL_MS)
    }

    try {
      const token = await deps.getToken()
      if (!token) throw new Error('Scalpel Stream is not set up on this PC. Disable and enable it again.')
      update({ phase: 'working' })

      const who = await resolveCharacter(prefs)
      const key = `${who.account}|${who.name}`
      // The profile says when poe.ninja last updated the character, so an unchanged one
      // costs no character download.
      const unchanged =
        lastPushed?.key === key &&
        lastPushed.updatedUtc === who.updatedUtc &&
        lastPushed.hideName === prefs.hideCharacterName

      if (!unchanged || force) {
        const raw = await deps.source.fetchCharacter(who)
        const { snapshot, warnings } = deps.build(raw, prefs.hideCharacterName)
        prunePatches(snapshot)
        base = snapshot
        await push(withPatches(snapshot), prefs.profileId, token)
        lastPushed = { key, updatedUtc: who.updatedUtc, hideName: prefs.hideCharacterName }
        update({ warnings })
      } else if (base && patches.some((p) => now() - p.at >= PATCH_TTL_MS)) {
        // Nothing new from the source, but a hotkey patch outlived its TTL: republish without it.
        patches = patches.filter((p) => now() - p.at < PATCH_TTL_MS)
        await push(withPatches(base), prefs.profileId, token)
      }

      failures = 0
      update({
        phase: 'idle',
        error: null,
        character: { name: who.name, league: who.league, level: who.level },
        sourceUpdatedUtc: base?.source.updatedUtc ?? null,
      })
      schedule(CHECK_INTERVAL_MS)
    } catch (e) {
      failures++
      const retryAfter = e instanceof StreamApiError && e.retryAfterSec ? e.retryAfterSec * 1000 : 0
      const backoff = Math.min(MAX_BACKOFF_MS, 60_000 * 2 ** (failures - 1))
      update({ phase: 'error', error: (e as Error).message })
      schedule(Math.max(retryAfter, backoff))
    }
  }

  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task)
    tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  function kick(force: boolean): Promise<void> {
    if (waiting) {
      waiting.force ||= force
      return waiting.done
    }
    const entry = { force, done: Promise.resolve() }
    waiting = entry
    entry.done = serial(() => {
      waiting = null
      return cycle(entry.force)
    })
    return entry.done
  }

  return {
    start() {
      stopped = false
      void kick(false)
    },
    stop() {
      stopped = true
      if (timer !== null) clearTimer(timer)
      timer = null
    },
    refresh() {
      if (!stopped) void kick(false)
    },
    pushNow() {
      return kick(true)
    },
    applyPatch(slot, item) {
      return serial(async () => {
        const prefs = deps.getPrefs()
        if (!prefs.enabled || !prefs.profileId || !base) {
          throw new Error('Scalpel Stream has not published your character yet.')
        }
        const token = await deps.getToken()
        if (!token) throw new Error('Scalpel Stream is not set up on this PC.')
        patches = [
          ...patches.filter((p) => p.slot !== slot),
          { slot, item, at: now(), replaced: itemKey(base.equipment[slot]) },
        ]
        await push(withPatches(base), prefs.profileId, token)
        update({})
      })
    },
    getStatus: () => status,
    currentSnapshot: () => base,
  }
}
