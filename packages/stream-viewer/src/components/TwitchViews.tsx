import { useEffect, useMemo, useState } from 'react'
import { TWITCH_POLL_MS } from '../config'
import type { StreamSource } from '../data/api'
import { twitchVersionSubscriber, useStream } from '../data/use-stream'
import type { TwitchContext, TwitchExt } from '../twitch'
import { CharacterHeader, UpdatedAge } from './CharacterHeader'
import { CompactGear } from './CompactGear'
import { StreamView, useNow } from './StreamView'
import { themeOf, ViewerRoot } from './ViewerRoot'
import { StreamLinks } from './StreamLinks'
import { PoweredBy, Window } from './Window'

/** Channel id from the helper's onAuthorized, plus the player context. */
function useTwitch(ext: TwitchExt | undefined): { source: StreamSource | null; context: TwitchContext } {
  const [channelId, setChannelId] = useState<string | null>(null)
  const [context, setContext] = useState<TwitchContext>({})
  useEffect(() => {
    if (!ext) return
    ext.onAuthorized((auth) => setChannelId(auth.channelId))
    ext.onContext((ctx) => setContext((prev) => ({ ...prev, ...ctx })))
  }, [ext])
  return { source: channelId ? { kind: 'twitch', channelId } : null, context }
}

function useTwitchStream(ext: TwitchExt | undefined) {
  const { source, context } = useTwitch(ext)
  const subscribe = useMemo(() => (ext ? twitchVersionSubscriber(ext) : undefined), [ext])
  const state = useStream(source, { pollMs: TWITCH_POLL_MS, subscribe })
  return { state, context }
}

/** Video overlay: a small "GEAR" tab on the player's left edge, where the PoE1 Armoury's
 *  sits, opens the panel. The tab fades while the player controls are hidden so it never
 *  sits on the game. */
export function OverlayView({
  ext,
  initiallyOpen = false,
}: {
  ext: TwitchExt | undefined
  /** Start with the panel open (stories and screenshots). */
  initiallyOpen?: boolean
}): JSX.Element {
  const { state, context } = useTwitchStream(ext)
  const [open, setOpen] = useState(initiallyOpen)
  const controlsVisible = context.arePlayerControlsVisible !== false
  return (
    <ViewerRoot className="ssv-overlay" theme={themeOf(state)}>
      <button
        type="button"
        className={`ssv-edge-tab${!controlsVisible && !open ? ' ssv-dim' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        GEAR
      </button>
      {open && (
        <div className="ssv-overlay-panel">
          <StreamView state={state} placement="side" />
        </div>
      )}
    </ViewerRoot>
  )
}

/** Mobile view: the panel fills the chat area; tapping an item opens its card below. */
export function MobileView({ ext }: { ext: TwitchExt | undefined }): JSX.Element {
  const { state } = useTwitchStream(ext)
  return (
    <ViewerRoot theme={themeOf(state)} style={{ padding: 6 }}>
      <StreamView state={state} placement="below" />
    </ViewerRoot>
  )
}

/** Panel under the player (318px wide, stays up while offline): a compact list. */
export function PanelView({ ext }: { ext: TwitchExt | undefined }): JSX.Element {
  const { state } = useTwitchStream(ext)
  const now = useNow()
  if (state.status !== 'ready' || state.head.state === 'hidden') {
    return (
      <ViewerRoot style={{ padding: 6 }}>
        <StreamView state={state} placement="below" />
      </ViewerRoot>
    )
  }
  const { snapshot } = state
  return (
    <ViewerRoot theme={snapshot.theme} style={{ padding: 6 }}>
      <div className="ssv-panel">
        <Window
          title="Scalpel Stream"
          headerEnd={<UpdatedAge snapshot={snapshot} now={now} />}
          footer={
            <>
              <StreamLinks links={snapshot.links} />
              <PoweredBy />
            </>
          }
        >
          <CharacterHeader snapshot={snapshot} />
          <div className="ssv-panel-body">
            <CompactGear snapshot={snapshot} />
          </div>
        </Window>
      </div>
    </ViewerRoot>
  )
}
