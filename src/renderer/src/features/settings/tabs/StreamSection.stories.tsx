import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef } from 'react'
import type { ProfileState } from '@scalpel/stream-contract'
import { normalizePoeAccount } from '@shared/poe-account'
import {
  DEFAULT_STREAM_SETTINGS,
  type StreamCharacterOption,
  type StreamOverview,
  type StreamPublisherStatus,
  type StreamSettings,
} from '@shared/contracts/stream'
import { StreamSection } from './StreamSection'

const LIVE = 'https://live.scalpel.fourth.party'
const PROFILE_ID = 'k3v9x2mq8w'
const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString()

const CHARACTERS: StreamCharacterOption[] = [
  { account: 'aer0_-2690', name: 'GassiusClay', league: 'Forbidden Rites', level: 95 },
  { account: 'aer0_-2690', name: 'SparkyBoi', league: 'Standard', level: 71 },
]

const publisher = (patch: Partial<StreamPublisherStatus> = {}): StreamPublisherStatus => ({
  phase: 'off',
  character: null,
  lastPushUtc: null,
  sourceUpdatedUtc: null,
  version: null,
  error: null,
  warnings: [],
  patchedSlots: [],
  ...patch,
})

const off = (): StreamOverview => ({
  settings: { ...DEFAULT_STREAM_SETTINGS },
  publisher: publisher(),
  profile: null,
  profileError: null,
  publicUrl: null,
  obsUrl: null,
})

/** Enabled with a profile but no Twitch link yet: share links use the profile id. */
const unlinked = (patch: Partial<StreamOverview> = {}): StreamOverview => ({
  settings: { ...DEFAULT_STREAM_SETTINGS, enabled: true, profileId: PROFILE_ID, poeAccount: 'aer0_#2690' },
  publisher: publisher({ phase: 'waiting-for-game' }),
  profile: { profileId: PROFILE_ID, state: 'live', hideCharacterName: false, slug: null, twitch: null, head: null },
  profileError: null,
  publicUrl: `${LIVE}/p/${PROFILE_ID}`,
  obsUrl: `${LIVE}/p/${PROFILE_ID}/obs`,
  ...patch,
})

/** Linked to a Twitch channel and publishing. */
const live = (patch: Partial<StreamPublisherStatus> = {}): StreamOverview =>
  unlinked({
    publisher: publisher({
      phase: 'idle',
      character: { name: 'GassiusClay', league: 'Forbidden Rites', level: 95 },
      lastPushUtc: ago(2),
      sourceUpdatedUtc: ago(14),
      version: 7,
      ...patch,
    }),
    profile: {
      profileId: PROFILE_ID,
      state: 'live',
      hideCharacterName: false,
      slug: 'aer0__',
      twitch: { channelId: '123456', login: 'aer0__' },
      head: { version: 7, publishedUtc: ago(2) },
    },
    publicUrl: `${LIVE}/aer0__`,
    obsUrl: `${LIVE}/aer0__/obs`,
  })

/** Answers the section's stream:* IPC calls from memory, so every control works in the story. */
function installStreamApi(initial: StreamOverview): void {
  let current = initial
  const set = (next: StreamOverview): StreamOverview => {
    current = next
    return next
  }
  const win = window as unknown as { api?: Record<string, unknown> }
  win.api = win.api ?? {}
  Object.assign(win.api, {
    streamGetOverview: async () => current,
    onStreamOverview: () => () => undefined,
    streamEnable: async () =>
      set(current.settings.profileId ? { ...current, settings: { ...current.settings, enabled: true } } : unlinked()),
    streamDisable: async () =>
      set({ ...current, settings: { ...current.settings, enabled: false }, publisher: publisher() }),
    streamDeleteProfile: async () => set(off()),
    streamPairingCode: async () => ({ code: 'K7M2Q9XA', expiresUtc: new Date(Date.now() + 600_000).toISOString() }),
    streamUpdateSettings: async (patch: Partial<StreamSettings>) =>
      set({
        ...current,
        settings: {
          ...current.settings,
          ...patch,
          poeAccount: normalizePoeAccount(patch.poeAccount ?? current.settings.poeAccount),
        },
      }),
    streamSetState: async (state: ProfileState) =>
      set({ ...current, profile: current.profile && { ...current.profile, state } }),
    streamPushNow: async () =>
      set({ ...current, publisher: { ...current.publisher, phase: 'idle', error: null, lastPushUtc: ago(0) } }),
    streamListCharacters: async () => CHARACTERS,
  })
}

function Board({ initial }: { initial: () => StreamOverview }): JSX.Element {
  const installed = useRef(false)
  if (!installed.current) {
    installStreamApi(initial())
    installed.current = true
  }
  return (
    <div style={{ width: 560, padding: 16 }}>
      <StreamSection />
    </div>
  )
}

const meta: Meta<typeof Board> = {
  title: 'Settings / Scalpel Stream',
  component: Board,
}
export default meta

type Story = StoryObj<typeof Board>

/** Fresh install: one toggle and the explanation. */
export const Off: Story = { args: { initial: off } }

/** Just enabled; PoE2 isn't running and no Twitch channel is linked. Click "Get pairing code". */
export const WaitingForGame: Story = { args: { initial: () => unlinked() } }

export const Live: Story = { args: { initial: () => live() } }

/** After the "Update Stream Slot" macro, until poe.ninja catches up. */
export const SlotPatched: Story = { args: { initial: () => live({ patchedSlots: ['Ring2', 'Helm'] }) } }

export const Working: Story = { args: { initial: () => live({ phase: 'working' }) } }

export const PublishError: Story = {
  args: {
    initial: () =>
      live({
        phase: 'error',
        error:
          'poe.ninja has no profile for aer0_#2690 yet. It adds accounts that are on the ladder or have logged in on poe.ninja.',
      }),
  },
}

/** The Worker is down or offline; the text is what client.ts actually throws. */
export const ServerUnreachable: Story = {
  args: {
    initial: () => unlinked({ profile: null, profileError: 'Scalpel Stream unreachable: net::ERR_CONNECTION_REFUSED' }),
  },
}
