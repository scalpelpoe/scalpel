// Story-only data: the hand-authored sample plus a REAL character (a poe.ninja
// capture) run through Scalpel's actual normalizer and tier resolver, so stories
// show exactly what viewers would see.
import type { StreamHead, StreamSnapshot } from '@scalpel/stream-contract'
import sample from '@scalpel/stream-contract/fixtures/sample-snapshot.json'
import tierData from '@shared/data/tiers/tiers-poe2.json'
import type { TierDataset } from '@shared/data/tiers/types'
import type { Decorator } from '@storybook/react-vite'
import ninjaCharacter from '../../../../src/main/stream/__fixtures__/ninja-character.json'
import { normalizeCharacter } from '../../../../src/main/stream/normalize'
import { NinjaCharacterSchema } from '../../../../src/main/stream/sources/ninja-types'
import { applyTiers } from '../../../../src/main/stream/tiers'
import type { TwitchExt } from '../twitch'
import '../styles.css'

export const sampleSnapshot = {
  ...sample,
  links: {
    filters: 'https://www.pathofexile.com/account/view-profile/Example-1234/item-filters',
    buildGuide: 'https://www.youtube.com/@example/videos',
  },
} as StreamSnapshot

export function realSnapshot(): StreamSnapshot {
  const normalized = normalizeCharacter(NinjaCharacterSchema.parse(ninjaCharacter), {
    now: new Date(Date.now() - 4 * 60_000),
    hideCharacterName: false,
  })
  for (const [item, raw] of normalized.sourceOf) applyTiers(item, raw, tierData as unknown as TierDataset)
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
