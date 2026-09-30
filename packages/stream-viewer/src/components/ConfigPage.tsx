import type { ProfileStatus } from '@scalpel/stream-contract'
import { paths } from '@scalpel/stream-contract/paths'
import { type FormEvent, useEffect, useState } from 'react'
import logo from '../assets/scalpel-logo-96.png'
import { API_BASE } from '../config'
import type { Fetcher } from '../data/api'
import type { TwitchAuth, TwitchExt } from '../twitch'

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

/** Broadcaster setup: pair this channel with a Scalpel install via its 8-character code.
 *  Styled like the Scalpel home page (web/public/site.css), not the in-game theme. */
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

  const canLink = !!auth && !busy && code.length === CODE_LENGTH

  const claim = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!canLink) return
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
    <div className="sc-home ssv-config">
      <main className="ssv-config-inner">
        <div className="sc-wordmark">
          <img src={logo} alt="" />
          <span>Scalpel Stream</span>
        </div>
        <div className="sc-dim">Shows your Path of Exile 2 gear to your viewers, live from Scalpel.</div>
        <section className="sc-card">
          {linked ? (
            <>
              <span className="sc-card-title">Channel linked</span>
              <div className="sc-ok">
                Linked{linked.twitch?.login ? ` as ${linked.twitch.login}` : ''}. Viewers will see your gear once
                Scalpel publishes it.
              </div>
            </>
          ) : (
            <>
              <span className="sc-card-title">Link your channel</span>
              <ol className="ssv-config-steps">
                <li>In Scalpel (PoE2 mode), open Settings, then the Stream tab.</li>
                <li>Turn on Scalpel Stream and press "Get pairing code".</li>
                <li>Enter the code below. It expires after 10 minutes.</li>
              </ol>
              <form onSubmit={(e) => void claim(e)}>
                <label className="sc-label" htmlFor="ssv-pairing-code">
                  Pairing code
                </label>
                <div className="ssv-config-code-row">
                  <input
                    id="ssv-pairing-code"
                    className="sc-input ssv-config-code"
                    placeholder="ABCD2345"
                    value={code}
                    maxLength={CODE_LENGTH + 4}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setCode(normalizeCode(e.target.value))}
                  />
                  <button type="submit" className="sc-btn sc-btn-primary" disabled={!canLink}>
                    {busy ? 'Linking...' : 'Link channel'}
                  </button>
                </div>
              </form>
            </>
          )}
          {unlinked && <div className="sc-dim">Unlinked. Viewers won't see your gear until you pair again.</div>}
          {error && <div className="sc-error">{error}</div>}
        </section>
        <button type="button" className="sc-btn ssv-config-unlink" disabled={!auth || busy} onClick={() => void unlink()}>
          Unlink this channel
        </button>
      </main>
    </div>
  )
}
