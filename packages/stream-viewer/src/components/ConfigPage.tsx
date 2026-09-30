import type { ProfileStatus } from '@scalpel/stream-contract'
import { paths } from '@scalpel/stream-contract/paths'
import { Button } from '@renderer/components/primitives/Button'
import { Label } from '@renderer/components/primitives/Label'
import { TextInput } from '@renderer/components/primitives/TextInput'
import { useEffect, useState } from 'react'
import { API_BASE } from '../config'
import type { Fetcher } from '../data/api'
import type { TwitchAuth, TwitchExt } from '../twitch'
import { ViewerRoot } from './ViewerRoot'

const CODE_CHARS = /[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g
const CODE_LENGTH = 8

/** "ab3d-5f7h" -> "AB3D5F7H"; drops anything outside the pairing alphabet. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(CODE_CHARS, '').slice(0, CODE_LENGTH)
}

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  if (res.status === 404) return "That code wasn't found or has expired. Get a fresh one in Scalpel."
  if (res.status === 409) return 'This channel is already linked to another Scalpel install. Unlink it there first.'
  if (res.status === 429) return 'Too many attempts. Wait a few minutes and try again.'
  return body?.error ?? `Something went wrong (${res.status}).`
}

/** Broadcaster setup: pair this channel with a Scalpel install via its 8-character code. */
export function ConfigPage({ ext, fetcher = fetch }: { ext: TwitchExt | undefined; fetcher?: Fetcher }): JSX.Element {
  const [auth, setAuth] = useState<TwitchAuth | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linked, setLinked] = useState<ProfileStatus | null>(null)
  const [unlinked, setUnlinked] = useState(false)

  useEffect(() => {
    ext?.onAuthorized((a) => setAuth(a))
  }, [ext])

  const send = async (method: 'POST' | 'DELETE', path: string, body?: unknown): Promise<Response | null> => {
    if (!auth) return null
    setBusy(true)
    setError(null)
    try {
      return await fetcher(API_BASE + path, {
        method,
        headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      setError("Couldn't reach Scalpel Stream. Try again in a moment.")
      return null
    } finally {
      setBusy(false)
    }
  }

  const claim = async (): Promise<void> => {
    const res = await send('POST', paths.twitchClaim(), { code })
    if (!res) return
    if (!res.ok) return setError(await errorMessage(res))
    setLinked((await res.json()) as ProfileStatus)
    setUnlinked(false)
    setCode('')
  }

  const unlink = async (): Promise<void> => {
    const res = await send('DELETE', paths.twitchLink())
    if (!res) return
    if (!res.ok && res.status !== 404) return setError(await errorMessage(res))
    setLinked(null)
    setUnlinked(true)
  }

  return (
    <ViewerRoot className="ssv-config">
      <div className="section-title">Scalpel Stream</div>
      <p className="text-text-dim mt-1 mb-4">
        Shows your Path of Exile 2 gear to viewers. In Scalpel (PoE2 mode), open Settings, then the Stream tab. Turn it
        on, press "Get pairing code", and enter the code here.
      </p>
      {linked ? (
        <p className="text-match mb-4">
          Linked{linked.twitch?.login ? ` as ${linked.twitch.login}` : ''}. Viewers will see your gear once Scalpel
          publishes it.
        </p>
      ) : (
        <div className="mb-4">
          <Label htmlFor="ssv-pairing-code">Pairing code</Label>
          <div className="flex gap-2">
            <TextInput
              id="ssv-pairing-code"
              fullWidth
              placeholder="ABCD2345"
              value={code}
              maxLength={CODE_LENGTH + 4}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, letterSpacing: '0.25em' }}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
            />
            <Button
              variant="primary"
              disabled={!auth || busy || code.length !== CODE_LENGTH}
              onClick={() => void claim()}
            >
              {busy ? 'Linking...' : 'Link channel'}
            </Button>
          </div>
        </div>
      )}
      {unlinked && <p className="text-text-dim mb-4">Unlinked. Viewers won't see your gear until you pair again.</p>}
      {error && <p className="text-danger mb-4">{error}</p>}
      <Button variant="ghost" size="sm" disabled={!auth || busy} onClick={() => void unlink()}>
        Unlink this channel
      </Button>
    </ViewerRoot>
  )
}
