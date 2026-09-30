import type { StreamHead, StreamSnapshot } from '@scalpel/stream-contract'
import sample from '@scalpel/stream-contract/fixtures/sample-snapshot.json'
import type { TwitchAuth, TwitchContext, TwitchExt, TwitchListener } from './twitch'

export const sampleSnapshot = (): StreamSnapshot => structuredClone(sample) as StreamSnapshot

export const sampleHead = (patch: Partial<StreamHead> = {}): StreamHead => ({
  profileId: 'p1',
  version: 1,
  publishedUtc: sample.publishedUtc,
  state: 'live',
  displayName: 'aer0__',
  ...patch,
})

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** A controllable stand-in for window.Twitch.ext. */
export function fakeTwitch(auth: Partial<TwitchAuth> = {}) {
  const listeners = new Set<TwitchListener>()
  let onAuthorized: ((a: TwitchAuth) => void) | null = null
  let onContext: ((c: TwitchContext, changed: string[]) => void) | null = null
  const ext: TwitchExt = {
    onAuthorized: (cb) => {
      onAuthorized = cb
    },
    onContext: (cb) => {
      onContext = cb
    },
    listen: (_target, cb) => listeners.add(cb),
    unlisten: (_target, cb) => listeners.delete(cb),
  }
  return {
    ext,
    authorize: () =>
      onAuthorized?.({ channelId: '123', clientId: 'ext', token: 'jwt', userId: 'U123', ...auth } as TwitchAuth),
    context: (c: TwitchContext) => onContext?.(c, Object.keys(c)),
    broadcast: (message: string) => {
      for (const l of listeners) l('broadcast', 'application/json', message)
    },
    listenerCount: () => listeners.size,
  }
}
