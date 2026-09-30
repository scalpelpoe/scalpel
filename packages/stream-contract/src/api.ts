import { z } from 'zod'

export const PROFILE_STATES = ['live', 'paused', 'hidden'] as const
export const ProfileStateSchema = z.enum(PROFILE_STATES)

/** Pairing codes avoid look-alike characters (0/O, 1/I/L) so streamers can read them off Scalpel. */
export const PAIRING = {
  alphabet: '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
  length: 8,
  ttlSeconds: 600,
} as const

export const PairingCodeSchema = z
  .string()
  .length(PAIRING.length)
  .regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/)

export const CreateProfileResponseSchema = z.strictObject({
  profileId: z.string(),
  publishToken: z.string(),
})

export const PairingCodeResponseSchema = z.strictObject({
  code: PairingCodeSchema,
  expiresUtc: z.iso.datetime(),
})

export const ProfileStatusSchema = z.strictObject({
  profileId: z.string(),
  state: ProfileStateSchema,
  hideCharacterName: z.boolean(),
  slug: z.string().nullable(),
  twitch: z.strictObject({ channelId: z.string(), login: z.string().nullable() }).nullable(),
  head: z.strictObject({ version: z.number().int().nonnegative(), publishedUtc: z.iso.datetime() }).nullable(),
})

export const PatchProfileRequestSchema = z.strictObject({
  state: ProfileStateSchema.optional(),
  hideCharacterName: z.boolean().optional(),
})

export const ClaimRequestSchema = z.strictObject({ code: PairingCodeSchema })

/** What viewers fetch first: the pointer to the current snapshot version. */
export const StreamHeadSchema = z.strictObject({
  profileId: z.string(),
  version: z.number().int().nonnegative(),
  publishedUtc: z.iso.datetime(),
  state: ProfileStateSchema,
  displayName: z.string().nullable(),
})

/** Twitch Extension PubSub broadcast: "snapshot version v is available". */
export const PubSubMessageSchema = z.strictObject({
  t: z.literal('s'),
  v: z.number().int().nonnegative(),
})

export const ApiErrorSchema = z.object({
  error: z.string(),
  issues: z.array(z.string()).optional(),
})

export { paths } from './paths'

export type ProfileState = z.infer<typeof ProfileStateSchema>
export type CreateProfileResponse = z.infer<typeof CreateProfileResponseSchema>
export type PairingCodeResponse = z.infer<typeof PairingCodeResponseSchema>
export type ProfileStatus = z.infer<typeof ProfileStatusSchema>
export type PatchProfileRequest = z.infer<typeof PatchProfileRequestSchema>
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>
export type StreamHead = z.infer<typeof StreamHeadSchema>
export type PubSubMessage = z.infer<typeof PubSubMessageSchema>
export type ApiError = z.infer<typeof ApiErrorSchema>
