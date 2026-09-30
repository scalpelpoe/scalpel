import { useEffect, useState } from 'react'
import type { StreamState } from '../data/use-stream'
import { GearPanel, type TooltipPlacement } from './GearPanel'
import { PoweredBy, Window } from './Window'

/** Re-render once a minute so "updated 5m ago" stays honest. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

function Message({ children }: { children: string }): JSX.Element {
  return (
    <div className="ssv-panel">
      <Window title="Scalpel Stream" footer={<PoweredBy />}>
        <div className="ssv-message">{children}</div>
      </Window>
    </div>
  )
}

/** Stream state -> the right card: loading, not set up, hidden, error, or the gear itself. */
export function StreamView({ state, placement }: { state: StreamState; placement: TooltipPlacement }): JSX.Element {
  const now = useNow()
  if (state.status === 'loading') return <Message>Loading gear...</Message>
  if (state.status === 'not-set-up') return <Message>This streamer hasn't set up Scalpel Stream yet.</Message>
  if (state.status === 'error') return <Message>{`Couldn't load gear right now. ${state.message}`}</Message>
  if (state.head.state === 'hidden') return <Message>The streamer has hidden their gear for now.</Message>
  return <GearPanel snapshot={state.snapshot} head={state.head} now={now} placement={placement} />
}
