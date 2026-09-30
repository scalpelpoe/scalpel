/** Worker route paths. Kept free of zod so browser bundles (the Twitch extension,
 *  the public page) can import them without pulling in the schemas. */

const enc = encodeURIComponent

export const paths = {
  profiles: () => '/v1/profiles',
  profile: (profileId: string) => `/v1/profiles/${enc(profileId)}`,
  pairingCode: (profileId: string) => `/v1/profiles/${enc(profileId)}/pairing-code`,
  snapshot: (profileId: string) => `/v1/profiles/${enc(profileId)}/snapshot`,
  twitchClaim: () => '/v1/twitch/claim',
  twitchLink: () => '/v1/twitch/link',
  headByTwitch: (channelId: string) => `/v1/heads/twitch/${enc(channelId)}`,
  headBySlug: (slug: string) => `/v1/heads/slug/${enc(slug)}`,
  /** For streamers without a Twitch link (YouTube, Kick): the random profile id is the share key. */
  headByProfile: (profileId: string) => `/v1/heads/profile/${enc(profileId)}`,
  snapshotVersion: (profileId: string, version: number) => `/v1/snapshots/${enc(profileId)}/${version}`,
} as const
