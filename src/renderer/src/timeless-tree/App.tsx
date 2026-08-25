import { useCallback, useEffect, useMemo, useState } from 'react'
import { Chrome } from '../secondary-overlay/Chrome'
import { bootTimelessJewels } from '../features/timeless-jewels/boot'
import { aggregateRadiusStats } from '../features/timeless-jewels/aggregate-radius-stats'
import { jewelIconUrl } from '../features/timeless-jewels/jewel-icons'
import { RadiusStatsPanel } from '../features/timeless-jewels/RadiusStatsPanel'
import { SkillTreeCanvas } from '../features/timeless-jewels/tree/SkillTreeCanvas'
import { DEFAULT_TIMELESS_STATE, type TimelessTreeState } from '../features/timeless-jewels/state'
import type { Node } from '../features/timeless-jewels/tree/skill-tree-types'

export function TimelessTreeApp(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<TimelessTreeState>(DEFAULT_TIMELESS_STATE)
  const [panelOpen, setPanelOpen] = useState(true)

  useEffect(() => {
    let cancelled = false
    bootTimelessJewels()
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const unsub = window.api.timelessTree.onState((next) => setState(next))
    window.api.timelessTree.requestState()
    return unsub
  }, [])

  const onClickNode = useCallback(
    (node: Node) => {
      if (!node.isJewelSocket || node.skill == null) return
      const next = { ...state, socketSkillId: node.skill }
      setState(next)
      window.api.timelessTree.setState(next)
    },
    [state],
  )

  const groups = useMemo(() => {
    if (!ready || !state.socketSkillId) {
      return { notables: [], smalls: [], nodes: [] }
    }
    try {
      return aggregateRadiusStats(state)
    } catch {
      return { notables: [], smalls: [], nodes: [] }
    }
  }, [ready, state])

  const iconUrl = jewelIconUrl(state.jewelName)

  return (
    <Chrome
      headerContent={<span className="text-xs text-text">Timeless Jewel Tree</span>}
      headerEnd={
        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {iconUrl && <img src={iconUrl} alt="" className="w-5 h-5 object-contain" draggable={false} />}
          <span className="text-[11px] text-text-dim">
            {state.jewelName} · {state.conqueror} · seed {state.seed}
            {state.socketSkillId != null ? ` · socket ${state.socketSkillId}` : ' · click a socket'}
          </span>
          <button
            type="button"
            className="text-[11px] px-2 py-0.5 border border-border rounded text-text-dim hover:text-text"
            onClick={() => setPanelOpen((v) => !v)}
            title="Toggle stats list"
          >
            {panelOpen ? 'Hide stats' : 'Show stats'}
          </button>
        </div>
      }
      onClose={() => window.api.timelessTree.requestClose()}
    >
      <div className="flex-1 min-h-0 flex" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {panelOpen && (
          <aside className="w-[280px] shrink-0 border-r border-border bg-bg-solid-translucent overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-border text-[11px] font-semibold text-text shrink-0">
              Stats in radius
            </div>
            <div className="flex-1 min-h-0">
              <RadiusStatsPanel
                groups={groups}
                emptyHint={
                  state.socketSkillId
                    ? 'No transformed stats for this seed/socket.'
                    : 'Click a jewel socket on the tree to list Notables and Smalls.'
                }
              />
            </div>
          </aside>
        )}
        <div className="flex-1 min-h-0 relative">
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm p-4 z-10">
              {error}
            </div>
          )}
          {!ready && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-text-dim text-sm z-10">
              Loading skill tree…
            </div>
          )}
          {ready && (
            <SkillTreeCanvas
              circledNode={state.socketSkillId ?? undefined}
              selectedJewel={state.jewelType}
              selectedConqueror={state.conqueror}
              seed={state.seed}
              jewelName={state.jewelName}
              highlightJewels
              onClickNode={onClickNode}
            />
          )}
        </div>
      </div>
    </Chrome>
  )
}
