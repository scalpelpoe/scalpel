import { useEffect } from 'react'
import logo from '../assets/scalpel-logo-96.png'
import { SCALPEL_SITE_URL, WEB_POLL_MS } from '../config'
import { useStream } from '../data/use-stream'
import type { WebRoute, WebSource } from '../entries/routes'
import { CharacterHeader } from './CharacterHeader'
import { CompactGear } from './CompactGear'
import { StreamView, useNow } from './StreamView'
import { SiteFooter } from './SiteFooter'
import { themeOf, ViewerRoot } from './ViewerRoot'
import { Window } from './Window'

/** live.scalpel.fourth.party/: what Scalpel Stream is, in the Scalpel home page's design. Twitch's
 *  "Powered by Scalpel" link lands here, so it explains rather than asks for a download. */
function Landing(): JSX.Element {
  return (
    <div className="sc-home">
      <main className="sc-main">
        <section className="sc-landing">
          <div className="sc-wordmark" style={{ marginBottom: 16 }}>
            <img src={logo} alt="" />
            <span>Scalpel Stream</span>
          </div>
          <h1 className="sc-h2" style={{ marginBottom: 14 }}>
            Path of Exile 2 gear, live on stream.
          </h1>
          <p className="sc-dim" style={{ maxWidth: 620, margin: 0 }}>
            Scalpel Stream shows a streamer's equipped gear, skills and keystones on Twitch and on their own page here,
            with in-game item cards and affix tiers. Streamers turn it on in Scalpel, the free, open-source overlay for
            Path of Exile.
          </p>
          <div style={{ marginTop: 24 }}>
            <a className="sc-btn" href={SCALPEL_SITE_URL}>
              What is Scalpel? ↗
            </a>
          </div>
        </section>
        <section className="sc-cards" style={{ paddingBottom: 90 }}>
          <div className="sc-card">
            <span className="sc-card-title">On Twitch</span>
            <p>Hover the stream and open the GEAR tab on the left edge to see what the streamer is wearing.</p>
          </div>
          <div className="sc-card">
            <span className="sc-card-title">Anywhere else</span>
            <p>
              Every streamer gets a page here, plus an OBS source for YouTube, Kick and the rest:{' '}
              <span className="sc-mono">live.scalpel.fourth.party/&lt;channel&gt;</span>
            </p>
          </div>
          <div className="sc-card">
            <span className="sc-card-title">The real items</span>
            <p>Items look the way they do in game, with affix tiers, runes and a Path of Building export.</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}

function Page({ source }: { source: WebSource }): JSX.Element {
  const state = useStream(source, { pollMs: WEB_POLL_MS })
  const name = state.status === 'ready' ? (state.head.displayName ?? state.snapshot.character.name) : null
  useEffect(() => {
    document.title = name ? `${name} · Scalpel Stream` : 'Scalpel Stream'
  }, [name])
  return (
    <div className="sc-home">
      <main className="sc-main">
        <ViewerRoot className="ssv-page-wrap" theme={themeOf(state)}>
          <StreamView state={state} placement="below" />
        </ViewerRoot>
      </main>
      <SiteFooter />
    </div>
  )
}

/** OBS browser source: transparent, no hover, refreshes on its own. */
function Obs({ source, layout }: { source: WebSource; layout: 'compact' | 'full' }): JSX.Element {
  const state = useStream(source, { pollMs: WEB_POLL_MS })
  useNow()
  if (state.status !== 'ready' || state.head.state === 'hidden') return <ViewerRoot className="ssv-obs" />
  return (
    <ViewerRoot className="ssv-obs" theme={state.snapshot.theme} style={{ pointerEvents: 'none' }}>
      {layout === 'full' ? (
        <StreamView state={state} placement="below" />
      ) : (
        <div className="ssv-obs-compact">
          <Window title="Scalpel Stream">
            <CharacterHeader snapshot={state.snapshot} />
            <div className="px-1.5 py-1.5">
              <CompactGear snapshot={state.snapshot} interactive={false} />
            </div>
          </Window>
        </div>
      )}
    </ViewerRoot>
  )
}

export function WebApp({ route }: { route: WebRoute }): JSX.Element {
  useEffect(() => {
    const bodyClass = route.view === 'obs' ? 'ssv-transparent' : 'ssv-page'
    document.body.classList.add(bodyClass)
    return () => document.body.classList.remove(bodyClass)
  }, [route.view])
  if (route.view === 'landing') return <Landing />
  if (route.view === 'obs') return <Obs source={route.source} layout={route.layout} />
  return <Page source={route.source} />
}
