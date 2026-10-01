import type { PairingCodeResponse, ProfileState, ProfileStatus, Slot } from '@scalpel/stream-contract'

/** Scalpel Stream preferences, persisted as `AppSettings.stream`. Per-machine
 *  (not profile-backed): the stream identity belongs to the PC, not a filter. */
export interface StreamSettings {
  enabled: boolean
  profileId: string | null
  /** Path of Exile account ("Name#1234") whose poe.ninja profile supplies the gear. */
  poeAccount: string
  /** Publish this character instead of following the one poe.ninja marks current. */
  pinnedCharacter: { account: string; name: string } | null
  hideCharacterName: boolean
  /** Link viewers to the account's public item filters on pathofexile.com. Only takes effect with an account. */
  linkItemFilters: boolean
  /** A video or written guide for the build, shown to viewers as "Build Guide". Empty for none. */
  buildGuideUrl: string
}

/** The stream settings the Streaming section can change. */
export type StreamSettingsPatch = Partial<
  Pick<StreamSettings, 'poeAccount' | 'pinnedCharacter' | 'hideCharacterName' | 'linkItemFilters' | 'buildGuideUrl'>
>

export const DEFAULT_STREAM_SETTINGS: StreamSettings = {
  enabled: false,
  profileId: null,
  poeAccount: '',
  pinnedCharacter: null,
  hideCharacterName: false,
  linkItemFilters: true,
  buildGuideUrl: '',
}

export type StreamPublisherPhase = 'off' | 'waiting-for-game' | 'working' | 'idle' | 'error'

export interface StreamPublisherStatus {
  phase: StreamPublisherPhase
  character: { name: string; league: string | null; level: number | null } | null
  lastPushUtc: string | null
  sourceUpdatedUtc: string | null
  version: number | null
  error: string | null
  warnings: string[]
  patchedSlots: Slot[]
}

/** A character the streamer can pin, as listed by the source. */
export interface StreamCharacterOption {
  account: string
  name: string
  league: string | null
  level: number | null
}

/** Everything the Streaming tab renders. */
export interface StreamOverview {
  settings: StreamSettings
  publisher: StreamPublisherStatus
  /** Server-side profile; null before enabling or when the backend is unreachable. */
  profile: ProfileStatus | null
  profileError: string | null
  publicUrl: string | null
  obsUrl: string | null
}

export type { PairingCodeResponse, ProfileState }
