import sample from '@scalpel/stream-contract/fixtures/sample-snapshot.json'
import type { StreamSnapshot } from '@scalpel/stream-contract'
import { describe, expect, it, vi } from 'vitest'
import { type ApiFetch, type ApiResponse, createStreamClient, StreamApiError } from './client'

function reply(status: number, body: unknown, headers: Record<string, string> = {}): ApiResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => headers[n.toLowerCase()] ?? null },
    json: async () => body,
  }
}

const status = {
  profileId: 'p1',
  state: 'live',
  hideCharacterName: false,
  slug: null,
  twitch: null,
  head: null,
}

describe('createStreamClient', () => {
  it('creates a profile without auth', async () => {
    const fetcher = vi.fn<ApiFetch>(async () => reply(201, { profileId: 'p1', publishToken: 't' }))
    const client = createStreamClient(fetcher, 'https://api.test')
    await expect(client.createProfile()).resolves.toEqual({ profileId: 'p1', publishToken: 't' })
    expect(fetcher).toHaveBeenCalledWith('https://api.test/v1/profiles', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: undefined,
    })
  })

  it('sends the publish token and JSON bodies', async () => {
    const fetcher = vi.fn<ApiFetch>(async () => reply(200, { version: 4 }))
    const client = createStreamClient(fetcher, 'https://api.test')
    await expect(client.putSnapshot('p1', 'tok', sample as StreamSnapshot)).resolves.toEqual({ version: 4 })
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.test/v1/profiles/p1/snapshot')
    expect(init.method).toBe('PUT')
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body ?? '')).toEqual(sample)
  })

  it('parses status responses', async () => {
    const client = createStreamClient(async () => reply(200, status), 'https://api.test')
    await expect(client.getProfile('p1', 'tok')).resolves.toEqual(status)
  })

  it('turns error bodies and Retry-After into StreamApiError', async () => {
    const client = createStreamClient(
      async () => reply(429, { error: 'rate limited' }, { 'retry-after': '12' }),
      'https://api.test',
    )
    const err = await client.putSnapshot('p1', 'tok', sample as StreamSnapshot).catch((e) => e)
    expect(err).toBeInstanceOf(StreamApiError)
    expect(err).toMatchObject({ status: 429, retryAfterSec: 12, message: 'rate limited' })
  })

  it('surfaces validation issues', async () => {
    const client = createStreamClient(
      async () => reply(400, { error: 'invalid snapshot', issues: ['equipment.Helm.icon: bad'] }),
      'https://api.test',
    )
    await expect(client.putSnapshot('p1', 'tok', sample as StreamSnapshot)).rejects.toMatchObject({
      status: 400,
      issues: ['equipment.Helm.icon: bad'],
    })
  })

  it('reports network failures as status 0', async () => {
    const client = createStreamClient(async () => {
      throw new Error('ECONNRESET')
    }, 'https://api.test')
    await expect(client.getProfile('p1', 'tok')).rejects.toMatchObject({ status: 0 })
  })

  it('rejects malformed success bodies', async () => {
    const client = createStreamClient(async () => reply(200, { nope: 1 }), 'https://api.test')
    await expect(client.pairingCode('p1', 'tok')).rejects.toBeInstanceOf(StreamApiError)
  })
})
