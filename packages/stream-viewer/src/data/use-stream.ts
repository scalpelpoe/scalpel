import type { StreamHead, StreamSnapshot } from '@scalpel/stream-contract'
import { useEffect, useState } from 'react'
import { PUBSUB_JITTER_MS } from '../config'
import type { TwitchExt, TwitchListener } from '../twitch'
import { type Fetcher, fetchHead, fetchSnapshot, NotSetUpError, type StreamSource } from './api'

export type StreamState =
  | { status: 'loading' }
  | { status: 'not-set-up' }
  | { status: 'error'; message: string }
  | { status: 'ready'; head: StreamHead; snapshot: StreamSnapshot }

/** Calls back with each announced snapshot version; returns an unsubscribe. */
export type VersionSubscriber = (onVersion: (version: number) => void) => () => void

export interface UseStreamOptions {
  fetcher?: Fetcher
  /** Head re-check interval. */
  pollMs: number
  subscribe?: VersionSubscriber
  random?: () => number
}

/** Twitch Extension PubSub broadcasts carry `{"t":"s","v":<version>}`. */
export function twitchVersionSubscriber(ext: TwitchExt): VersionSubscriber {
  return (onVersion) => {
    const listener: TwitchListener = (_target, _contentType, message) => {
      try {
        const parsed = JSON.parse(message) as { t?: unknown; v?: unknown }
        if (parsed.t === 's' && typeof parsed.v === 'number' && Number.isInteger(parsed.v)) onVersion(parsed.v)
      } catch {
        // Not ours.
      }
    }
    ext.listen('broadcast', listener)
    return () => ext.unlisten('broadcast', listener)
  }
}

function sourceKey(source: StreamSource | null): string {
  if (!source) return ''
  if (source.kind === 'twitch') return `t:${source.channelId}`
  return source.kind === 'slug' ? `s:${source.slug}` : `p:${source.profileId}`
}

/** Loads a channel's head and snapshot, then keeps them current via PubSub pings
 *  (after a random delay) and a slower head re-check. */
export function useStream(source: StreamSource | null, options: UseStreamOptions): StreamState {
  const [state, setState] = useState<StreamState>({ status: 'loading' })
  const key = sourceKey(source)
  const { fetcher, pollMs, subscribe } = options
  const random = options.random ?? Math.random

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` identifies the source; the options are stable per view.
  useEffect(() => {
    if (!source) return
    let alive = true
    let current: { head: StreamHead; snapshot: StreamSnapshot } | null = null
    const timers = new Set<ReturnType<typeof setTimeout>>()
    setState({ status: 'loading' })

    const show = (head: StreamHead, snapshot: StreamSnapshot): void => {
      current = { head, snapshot }
      if (alive) setState({ status: 'ready', head, snapshot })
    }

    const fail = (e: unknown): void => {
      if (!alive) return
      if (e instanceof NotSetUpError) setState({ status: 'not-set-up' })
      // Keep showing the last good gear through transient errors.
      else if (!current) setState({ status: 'error', message: (e as Error).message })
    }

    const refreshHead = async (): Promise<void> => {
      try {
        const head = await fetchHead(source, fetcher)
        if (!alive) return
        if (current && head.profileId === current.head.profileId && head.version === current.head.version) {
          show(head, current.snapshot) // state (paused/hidden) may have changed
          return
        }
        show(head, await fetchSnapshot(head.profileId, head.version, fetcher))
      } catch (e) {
        fail(e)
      }
    }

    const onVersion = (version: number): void => {
      const base = current
      if (!base || version <= base.head.version) return
      const timer = setTimeout(
        () => {
          timers.delete(timer)
          fetchSnapshot(base.head.profileId, version, fetcher)
            .then((snapshot) => show({ ...base.head, version, publishedUtc: snapshot.publishedUtc }, snapshot))
            .catch(fail)
        },
        Math.floor(random() * PUBSUB_JITTER_MS),
      )
      timers.add(timer)
    }

    void refreshHead()
    const interval = setInterval(() => void refreshHead(), pollMs)
    const unsubscribe = subscribe?.(onVersion)

    return () => {
      alive = false
      clearInterval(interval)
      for (const t of timers) clearTimeout(t)
      unsubscribe?.()
    }
  }, [key])

  return source ? state : { status: 'loading' }
}
