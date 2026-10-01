// Story-only data: the hand-authored sample plus a REAL character (a poe.ninja
// capture) run through Scalpel's actual normalizer and tier resolver, so stories
// show exactly what viewers would see.
import type { PriceCheck, SnapshotItem, StreamHead, StreamSnapshot } from '@scalpel/stream-contract'
import sample from '@scalpel/stream-contract/fixtures/sample-snapshot.json'
import priceChecks from './price-checks.json'
import realPriceChecks from './price-checks-real.json'
import tierData from '@shared/data/tiers/tiers-poe2.json'
import type { TierDataset } from '@shared/data/tiers/types'
import type { Decorator } from '@storybook/react-vite'
import ninjaCharacter from '../../../../src/main/stream/__fixtures__/ninja-character.json'
import { normalizeCharacter } from '../../../../src/main/stream/normalize'
import { NinjaCharacterSchema } from '../../../../src/main/stream/sources/ninja-types'
import { applyTiers } from '../../../../src/main/stream/tiers'
import type { TwitchExt } from '../twitch'
import '../styles.css'

/** Real buildPriceCheck output (src/main/stream/price-query.ts) over the PoE2 trade fixtures. */
export const samplePriceChecks = priceChecks as unknown as Record<FixtureKey, PriceCheck>

type FixtureKey = 'ring' | 'armour' | 'unique'

/** The poe2-trade-items fixture each price check was built from, so a story's item header
 *  names the item whose rows it shows. */
const fixtureItems = {
  ring: { name: 'Blood Band', baseType: 'Gold Ring', rarity: 'rare' },
  armour: { name: 'Doom Shell', baseType: "Falconer's Jacket", rarity: 'rare' },
  unique: { name: "Ventor's Gamble", baseType: 'Gold Ring', rarity: 'unique' },
} as const

/** `item` renamed to the fixture's item, carrying that fixture's price check. */
export function withPriceCheck(item: SnapshotItem, key: FixtureKey): SnapshotItem & { priceCheck: PriceCheck } {
  return { ...item, ...fixtureItems[key], priceCheck: samplePriceChecks[key] }
}

const base = {
  ...sample,
  links: {
    filters: 'https://www.pathofexile.com/account/view-profile/Example-1234/item-filters',
    buildGuide: 'https://www.youtube.com/@example/videos',
  },
} as StreamSnapshot

// A rare ring and a unique ring carry a price check; everything else stays card-only.
export const sampleSnapshot: StreamSnapshot = {
  ...base,
  equipment: {
    ...base.equipment,
    ...(base.equipment.Ring ? { Ring: withPriceCheck(base.equipment.Ring, 'ring') } : {}),
    ...(base.equipment.Ring2 ? { Ring2: withPriceCheck(base.equipment.Ring2, 'unique') } : {}),
  },
}

/** Price checks for the real character, keyed `equipment.<Slot>`, `flasks.<i>`, `charms.<i>`,
 *  `jewels.<i>` or `other.<i>`: Scalpel's real pipeline (ninjaItemText -> parseItemText ->
 *  buildPriceCheck, src/main/stream) over the poe.ninja capture above, with the live PoE2
 *  trade stat list, league 'Fate of the Vaal'. Items whose buildPriceCheck returned null are
 *  absent. A point-in-time capture against the live trade stat list, so a rerun can differ. price-checks-real.json is generated, not hand-edited. To regenerate:
 *    1. curl https://www.pathofexile.com/api/trade2/data/stats > <scratch>/stats.json
 *    2. add a temporary src/main/stream/gen.test.ts: mock 'electron' as in price-query.test.ts,
 *       setPoeVersion(2), _setStatEntriesForTests(<stats.json result[].entries flattened>),
 *       normalizeCharacter(NinjaCharacterSchema.parse(ninja-character.json)), then for every item
 *       in equipment/flasks/charms/jewels/other: ninjaItemText(sourceOf.get(item)) ->
 *       parseItemText -> buildPriceCheck(parsed, 'Fate of the Vaal'); write the keyed map
 *       to this directory as price-checks-real.json
 *    3. STATS_JSON=<scratch>/stats.json npx vitest run src/main/stream/gen.test.ts, then delete it. */
const realChecks = realPriceChecks as unknown as Record<string, PriceCheck>

function attachRealChecks(s: StreamSnapshot): void {
  const give = (item: SnapshotItem | undefined, key: string): SnapshotItem | undefined =>
    item && realChecks[key] ? { ...item, priceCheck: realChecks[key] } : item
  for (const slot of Object.keys(s.equipment) as Array<keyof StreamSnapshot['equipment']>) {
    const item = give(s.equipment[slot], `equipment.${slot}`)
    if (item) s.equipment[slot] = item
  }
  for (const group of ['flasks', 'charms', 'jewels', 'other'] as const) {
    s[group] = s[group].map((item, i) => give(item, `${group}.${i}`) as SnapshotItem)
  }
}

/** The real character with a price check on every item the pipeline can build one for. */
export function realSnapshot(): StreamSnapshot {
  const normalized = normalizeCharacter(NinjaCharacterSchema.parse(ninjaCharacter), {
    now: new Date(Date.now() - 4 * 60_000),
    hideCharacterName: false,
  })
  for (const [item, raw] of normalized.sourceOf) applyTiers(item, raw, tierData as unknown as TierDataset)
  attachRealChecks(normalized.snapshot)
  return normalized.snapshot
}

export const head = (patch: Partial<StreamHead> = {}): StreamHead => ({
  profileId: 'story',
  version: 1,
  publishedUtc: new Date().toISOString(),
  state: 'live',
  displayName: 'aer0__',
  ...patch,
})

/** Answers the viewer's API calls from memory, for stories that mount whole views. */
export function withFakeApi(snapshot: () => StreamSnapshot, headPatch: Partial<StreamHead> = {}): Decorator {
  return (Story) => {
    const realFetch = window.fetch.bind(window)
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
      if (url.includes('/v1/heads/')) return json(head(headPatch))
      if (url.includes('/v1/snapshots/')) return json(snapshot())
      if (url.includes('/v1/twitch/claim')) {
        return json({
          profileId: 'story',
          state: 'live',
          hideCharacterName: false,
          slug: 'aer0__',
          twitch: { channelId: '123', login: 'aer0__' },
          head: null,
        })
      }
      return realFetch(input, init)
    }) as typeof fetch
    return <Story />
  }
}

/** A channel or share link with no Scalpel Stream profile behind it. */
export const withMissingProfile: Decorator = (Story) => {
  const realFetch = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes('/v1/heads/')
      ? new Response('{"error":"not found"}', { status: 404 })
      : realFetch(input, init)) as typeof fetch
  return <Story />
}

export function fakeExt(): TwitchExt {
  return {
    onAuthorized: (cb) => cb({ channelId: '123', clientId: 'story', token: 'story-jwt', userId: 'U123' }),
    onContext: (cb) => cb({ arePlayerControlsVisible: true }, ['arePlayerControlsVisible']),
    listen: () => undefined,
    unlisten: () => undefined,
  }
}

/** A stand-in Twitch player behind the video overlay, in the brand navy. `zoom` draws the whole
 *  player larger for high-resolution screenshots. */
export function playerFrame(width: number, height: number, zoom = 1): Decorator {
  return (Story) => (
    <div
      data-player-frame
      style={{
        position: 'relative',
        width,
        height,
        zoom,
        background: '#101118',
        borderRadius: 6,
        overflow: 'hidden',
        transform: 'translateZ(0)',
      }}
    >
      <Story />
    </div>
  )
}

/** A default 1280x720 Twitch player. */
export const PlayerFrame: Decorator = playerFrame(1280, 720)
