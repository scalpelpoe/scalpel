import type { PairingCodeResponse, ProfileState, ProfileStatus } from '@scalpel/stream-contract'
import {
  DEFAULT_STREAM_SETTINGS,
  type StreamCharacterOption,
  type StreamOverview,
  type StreamSettings,
} from '@shared/contracts/stream'
import bundledPoe2Icons from '@scalpel/item-data/poe2.json'
import { POE_SIDEBAR_RATIO } from '@shared/poe-geometry'
import type { AppSettings, PoeItem } from '@shared/types'
import { net } from 'electron'
import type Store from 'electron-store'
import { desktop } from '../desktop'
import { isGameAttached, onGameAttachedChange } from '../game-presence'
import { getPoeVersion } from '../game-state'
import { getTierData } from '../tier-data'
import { loadIconCache } from '../trade/icon-cache'
import { lookupUniquePriceForBase } from '../trade/prices'
import { type ApiFetch, createStreamClient, STREAM_API, StreamApiError } from './client'
import { paperdollSide, slotForItem, snapshotItemFromClipboard } from './clipboard-item'
import { enrichCharacter, toSnapshotPrice } from './enrich'
import { normalizeCharacter } from './normalize'
import { createPublisher, type Publisher } from './publisher'
import { normalizePoeAccount } from './poe-account'
import { createPoeNinjaSource, type SourceFetch } from './sources/poe-ninja'
import { clearStreamToken, loadStreamToken, saveStreamToken } from './token-store'

/** Public viewer site (the stream-viewer web build). */
export const STREAM_LIVE_BASE = 'https://live.scalpel.fourth.party'

// Dev overrides so the whole loop can run against `wrangler dev` and a local viewer.
const API_BASE = process.env.SCALPEL_STREAM_API || STREAM_API
const LIVE_BASE = process.env.SCALPEL_STREAM_LIVE || STREAM_LIVE_BASE
const USER_AGENT = 'Scalpel-Stream'
const PROFILE_CACHE_MS = 60_000
const bundledIcons = bundledPoe2Icons as Record<string, string>

function debugWarn(...args: unknown[]): void {
  if (process.env.SCALPEL_DEBUG_LOG) console.warn('[stream]', ...args)
}

export type StreamSettingsPatch = Partial<Pick<StreamSettings, 'poeAccount' | 'pinnedCharacter' | 'hideCharacterName'>>

export interface StreamRuntime {
  publisher: Publisher
  getOverview(): Promise<StreamOverview>
  enable(): Promise<StreamOverview>
  disable(): Promise<StreamOverview>
  deleteProfile(): Promise<StreamOverview>
  pairingCode(): Promise<PairingCodeResponse>
  setState(state: ProfileState): Promise<StreamOverview>
  updateSettings(patch: StreamSettingsPatch): Promise<StreamOverview>
  pushNow(): Promise<StreamOverview>
  listCharacters(): Promise<StreamCharacterOption[]>
  /** "Update Stream Slot" macro: copy the hovered equipped item and show it in its slot now. */
  patchFromHoveredItem(capture: () => Promise<PoeItem | null>): Promise<void>
}

export function createStreamRuntime(
  store: Store<AppSettings>,
  onOverview: (overview: StreamOverview) => void,
): StreamRuntime {
  const sourceFetch: SourceFetch = (url, init) =>
    net.fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, signal: init?.signal })
  const apiFetch: ApiFetch = (url, init) =>
    net.fetch(url, { method: init.method, headers: { ...init.headers, 'User-Agent': USER_AGENT }, body: init.body })

  const source = createPoeNinjaSource(sourceFetch)
  const client = createStreamClient(apiFetch, API_BASE)

  let profile: { value: ProfileStatus | null; error: string | null; at: number } = { value: null, error: null, at: 0 }

  const getSettings = (): StreamSettings => ({ ...DEFAULT_STREAM_SETTINGS, ...(store.get('stream') ?? {}) })
  const saveSettings = (next: StreamSettings): void => store.set('stream', next)

  function overviewNow(): StreamOverview {
    // Twitch-linked streamers get a readable URL; everyone else shares the profile-id link.
    const slug = profile.value?.slug ?? null
    const { profileId } = getSettings()
    const publicUrl = slug
      ? `${LIVE_BASE}/${encodeURIComponent(slug)}`
      : profileId
        ? `${LIVE_BASE}/p/${encodeURIComponent(profileId)}`
        : null
    return {
      settings: getSettings(),
      publisher: publisher.getStatus(),
      profile: profile.value,
      profileError: profile.error,
      publicUrl,
      obsUrl: publicUrl ? `${publicUrl}/obs` : null,
    }
  }

  const publisher = createPublisher({
    source,
    client,
    build: (raw, hideCharacterName) => {
      const normalized = normalizeCharacter(raw, { now: new Date(), hideCharacterName })
      // Tier data and prices are loaded for the game Scalpel is attached to; a
      // forced push from PoE1 mode skips enrichment rather than mixing games.
      const poe2 = getPoeVersion() === 2
      enrichCharacter(normalized, {
        tierData: poe2 ? getTierData() : null,
        uniquePrice: poe2 ? lookupUniquePriceForBase : () => undefined,
      })
      return { snapshot: normalized.snapshot, warnings: normalized.warnings }
    },
    getPrefs: getSettings,
    getToken: loadStreamToken,
    isGameActive: () => isGameAttached() && getPoeVersion() === 2,
    onStatus: () => onOverview(overviewNow()),
  })
  onGameAttachedChange(() => publisher.refresh())

  async function requireIdentity(): Promise<{ profileId: string; token: string }> {
    const { profileId } = getSettings()
    const token = await loadStreamToken()
    if (!profileId || !token) throw new Error('Enable Scalpel Stream first.')
    return { profileId, token }
  }

  async function refreshProfile(force = false): Promise<void> {
    if (!force && Date.now() - profile.at < PROFILE_CACHE_MS) return
    const { profileId } = getSettings()
    const token = await loadStreamToken()
    if (!profileId || !token) {
      profile = { value: null, error: null, at: Date.now() }
      return
    }
    try {
      profile = { value: await client.getProfile(profileId, token), error: null, at: Date.now() }
    } catch (e) {
      profile = { value: profile.value, error: (e as Error).message, at: Date.now() }
    }
  }

  /** A streamer whose linked Twitch channel poe.ninja lists doesn't have to type the
   *  account: the streamer search names it. Runs in the background and re-broadcasts. */
  let autofilling = false
  async function autofillAccount(): Promise<void> {
    const login = profile.value?.twitch?.login
    if (autofilling || !login || getSettings().poeAccount) return
    autofilling = true
    try {
      const account = await source.streamerAccount(login)
      if (!account || getSettings().poeAccount) return
      saveSettings({ ...getSettings(), poeAccount: account, pinnedCharacter: null })
      publisher.refresh()
      onOverview(overviewNow())
    } catch (e) {
      debugWarn('account autofill failed:', (e as Error).message)
    } finally {
      autofilling = false
    }
  }

  async function fresh(): Promise<StreamOverview> {
    await refreshProfile(true)
    void autofillAccount()
    const overview = overviewNow()
    onOverview(overview)
    return overview
  }

  /** Server-side settings are best effort: publishing works without them. */
  async function patchServer(patch: { state?: ProfileState; hideCharacterName?: boolean }): Promise<void> {
    try {
      const { profileId, token } = await requireIdentity()
      profile = { value: await client.patchProfile(profileId, token, patch), error: null, at: Date.now() }
    } catch (e) {
      profile = { ...profile, error: (e as Error).message }
    }
  }

  return {
    publisher,

    async getOverview() {
      await refreshProfile()
      void autofillAccount()
      return overviewNow()
    },

    async enable() {
      const settings = getSettings()
      let token = await loadStreamToken()
      if (!settings.profileId || !token) {
        const created = await client.createProfile()
        await saveStreamToken(created.publishToken)
        token = created.publishToken
        settings.profileId = created.profileId
      }
      saveSettings({ ...settings, enabled: true })
      await patchServer({ state: 'live', hideCharacterName: settings.hideCharacterName })
      void publisher.pushNow()
      return fresh()
    },

    async disable() {
      saveSettings({ ...getSettings(), enabled: false })
      await patchServer({ state: 'paused' })
      publisher.refresh()
      return fresh()
    },

    async deleteProfile() {
      const settings = getSettings()
      const token = await loadStreamToken()
      if (settings.profileId && token) {
        try {
          await client.deleteProfile(settings.profileId, token)
        } catch (e) {
          // Already gone server-side is fine; anything else means the viewer data may linger.
          if (!(e instanceof StreamApiError && (e.status === 404 || e.status === 401))) throw e
        }
      }
      await clearStreamToken()
      saveSettings({ ...DEFAULT_STREAM_SETTINGS, poeAccount: settings.poeAccount })
      publisher.refresh()
      return fresh()
    },

    async pairingCode() {
      const { profileId, token } = await requireIdentity()
      return client.pairingCode(profileId, token)
    },

    async setState(state) {
      const { profileId, token } = await requireIdentity()
      profile = { value: await client.patchProfile(profileId, token, { state }), error: null, at: Date.now() }
      const overview = overviewNow()
      onOverview(overview)
      return overview
    },

    async updateSettings(patch) {
      const current = getSettings()
      const next: StreamSettings = { ...current }
      if (patch.poeAccount !== undefined) {
        next.poeAccount = normalizePoeAccount(patch.poeAccount)
        // A pin names a character on the old account.
        if (next.poeAccount !== current.poeAccount) next.pinnedCharacter = null
      }
      if (patch.pinnedCharacter !== undefined) next.pinnedCharacter = patch.pinnedCharacter
      if (patch.hideCharacterName !== undefined) next.hideCharacterName = patch.hideCharacterName
      saveSettings(next)
      if (next.profileId && next.hideCharacterName !== current.hideCharacterName) {
        await patchServer({ hideCharacterName: next.hideCharacterName })
      }
      publisher.refresh()
      return fresh()
    },

    async pushNow() {
      await publisher.pushNow()
      return fresh()
    },

    async listCharacters() {
      const account = getSettings().poeAccount
      if (!account) return []
      const rows = await source.accountCharacters(account)
      return rows.map((r) => ({ account: r.account, name: r.name, league: r.league, level: r.level }))
    },

    async patchFromHoveredItem(capture) {
      if (getPoeVersion() !== 2 || !getSettings().enabled) return
      const base = publisher.currentSnapshot()
      if (!base) {
        debugWarn('slot patch skipped: nothing published yet')
        return
      }
      const item = await capture()
      if (!item) return

      const cursor = desktop.getCursorScreenPoint()
      const game = desktop.getGameBounds()
      const side = cursor && game ? paperdollSide(cursor.x, game, POE_SIDEBAR_RATIO) : 'left'
      const slot = slotForItem(item, side, base.character.activeWeaponSet)
      if (!slot) {
        debugWarn(`slot patch skipped: ${item.itemClass} has no paperdoll slot`)
        return
      }
      const patched = snapshotItemFromClipboard(item, {
        iconFor: (name, baseType) => {
          const runtime = loadIconCache(2)
          return bundledIcons[name] ?? bundledIcons[baseType] ?? runtime[name] ?? runtime[baseType]
        },
        price: (i) => (i.name ? toSnapshotPrice(lookupUniquePriceForBase(i.name, i.baseType)) : null),
      })
      if (!patched) {
        debugWarn(`slot patch skipped: no item art for ${item.baseType}`)
        return
      }
      try {
        await publisher.applyPatch(slot, patched)
      } catch (e) {
        debugWarn('slot patch failed:', (e as Error).message)
      }
    },
  }
}
