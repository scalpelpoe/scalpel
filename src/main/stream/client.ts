import {
  ApiErrorSchema,
  type CreateProfileResponse,
  CreateProfileResponseSchema,
  type PairingCodeResponse,
  PairingCodeResponseSchema,
  type PatchProfileRequest,
  type ProfileStatus,
  ProfileStatusSchema,
  paths,
  type StreamSnapshot,
} from '@scalpel/stream-contract'
import { z } from 'zod'

/** Scalpel Stream's Worker (the scalpel-stream-api repo). */
export const STREAM_API = 'https://api.scalpel.fourth.party'

export interface ApiResponse {
  ok: boolean
  status: number
  headers: { get(name: string): string | null }
  json(): Promise<unknown>
}

export type ApiFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<ApiResponse>

export class StreamApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSec: number | null = null,
    readonly issues: string[] = [],
  ) {
    super(message)
  }
}

export interface StreamClient {
  createProfile(): Promise<CreateProfileResponse>
  getProfile(profileId: string, token: string): Promise<ProfileStatus>
  patchProfile(profileId: string, token: string, patch: PatchProfileRequest): Promise<ProfileStatus>
  deleteProfile(profileId: string, token: string): Promise<void>
  pairingCode(profileId: string, token: string): Promise<PairingCodeResponse>
  putSnapshot(profileId: string, token: string, snapshot: StreamSnapshot): Promise<{ version: number }>
}

const PutResponseSchema = z.object({ version: z.number().int().nonnegative() })

export function createStreamClient(fetcher: ApiFetch, base: string = STREAM_API): StreamClient {
  async function call<T>(
    method: string,
    path: string,
    schema: z.ZodType<T> | null,
    token?: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'

    let res: ApiResponse
    try {
      res = await fetcher(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch (e) {
      throw new StreamApiError(`Scalpel Stream unreachable: ${(e as Error).message}`, 0)
    }

    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(await res.json().catch(() => null))
      const retry = Number(res.headers.get('retry-after'))
      throw new StreamApiError(
        parsed.success ? parsed.data.error : `Scalpel Stream answered ${res.status}`,
        res.status,
        Number.isFinite(retry) && retry > 0 ? retry : null,
        parsed.success ? (parsed.data.issues ?? []) : [],
      )
    }
    if (!schema) return undefined as T
    const parsed = schema.safeParse(await res.json())
    if (!parsed.success) throw new StreamApiError('Scalpel Stream sent an unexpected response', res.status)
    return parsed.data
  }

  return {
    createProfile: () => call('POST', paths.profiles(), CreateProfileResponseSchema),
    getProfile: (id, token) => call('GET', paths.profile(id), ProfileStatusSchema, token),
    patchProfile: (id, token, patch) => call('PATCH', paths.profile(id), ProfileStatusSchema, token, patch),
    deleteProfile: (id, token) => call('DELETE', paths.profile(id), null, token),
    pairingCode: (id, token) => call('POST', paths.pairingCode(id), PairingCodeResponseSchema, token),
    putSnapshot: (id, token, snapshot) => call('PUT', paths.snapshot(id), PutResponseSchema, token, snapshot),
  }
}
