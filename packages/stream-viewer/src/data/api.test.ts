import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, sampleHead, sampleSnapshot } from '../test-helpers'
import { fetchHead, fetchSnapshot, NotSetUpError } from './api'

describe('fetchHead', () => {
  it('asks for the channel or slug head', async () => {
    const fetcher = vi.fn(async (_url: string) => jsonResponse(sampleHead()))
    await fetchHead({ kind: 'twitch', channelId: '123' }, fetcher, 'https://api.test')
    await fetchHead({ kind: 'slug', slug: 'aer0__' }, fetcher, 'https://api.test')
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.test/v1/heads/twitch/123',
      'https://api.test/v1/heads/slug/aer0__',
    ])
  })

  it('treats a 404 as "not set up" and rejects odd bodies', async () => {
    await expect(fetchHead({ kind: 'slug', slug: 'x' }, async () => jsonResponse({}, 404))).rejects.toBeInstanceOf(
      NotSetUpError,
    )
    await expect(fetchHead({ kind: 'slug', slug: 'x' }, async () => jsonResponse({ nope: 1 }))).rejects.toThrow(
      /unexpected/,
    )
    await expect(fetchHead({ kind: 'slug', slug: 'x' }, async () => jsonResponse({}, 500))).rejects.toThrow(/500/)
  })
})

describe('fetchSnapshot', () => {
  it('loads a version and checks its shape', async () => {
    const fetcher = vi.fn(async () => jsonResponse(sampleSnapshot()))
    const snapshot = await fetchSnapshot('p1', 7, fetcher, 'https://api.test')
    expect(snapshot.character.class).toBe('Deadeye')
    expect(fetcher).toHaveBeenCalledWith('https://api.test/v1/snapshots/p1/7')
    await expect(fetchSnapshot('p1', 7, async () => jsonResponse({ schema: 2 }))).rejects.toThrow(/unreadable/)
  })
})
