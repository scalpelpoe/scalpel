import { useCallback, useEffect, useMemo, useState } from 'react'
import { aggregateRadiusStats } from './aggregate-radius-stats'
import { bootTimelessJewels } from './boot'
import { requireData, type JewelType } from './crystalline'
import { jewelIconUrl } from './jewel-icons'
import { parseTimelessJewelClipboard } from './parse-jewel'
import { RadiusStatsPanel } from './RadiusStatsPanel'
import { DEFAULT_TIMELESS_STATE, type TimelessTreeState } from './state'
import { drawnNodes } from './tree/skill-tree'

function conquerorsForJewel(jewelType: number): string[] {
  const map = requireData().TimelessJewelConquerors[jewelType]
  return map ? Object.keys(map) : []
}

export function TimelessJewels(): JSX.Element {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<TimelessTreeState>(DEFAULT_TIMELESS_STATE)
  const [pasteHint, setPasteHint] = useState<string | null>(null)

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
    const unsub = window.api.timelessTree.onState((next: TimelessTreeState) => {
      setState(next)
    })
    return () => {
      unsub()
    }
  }, [])

  const jewelOptions = useMemo(() => {
    if (!ready) return [] as Array<{ type: JewelType; name: string }>
    const jewels = requireData().TimelessJewels
    return Object.entries(jewels).map(([k, name]) => ({ type: Number(k) as JewelType, name }))
  }, [ready])

  const conquerorOptions = useMemo(() => {
    if (!ready) return [] as string[]
    return conquerorsForJewel(state.jewelType)
  }, [ready, state.jewelType])

  const seedRange = ready ? requireData().TimelessJewelSeedRanges[state.jewelType] : null

  const groups = useMemo(() => {
    if (!ready || !state.socketSkillId) return { notables: [], smalls: [], nodes: [] }
    try {
      return aggregateRadiusStats(state)
    } catch {
      return { notables: [], smalls: [], nodes: [] }
    }
  }, [ready, state])

  const pushState = useCallback((next: TimelessTreeState) => {
    setState(next)
    window.api.timelessTree.setState(next)
  }, [])

  const onPaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = parseTimelessJewelClipboard(text)
      if (!parsed) {
        setPasteHint('Clipboard is not a Timeless Jewel (Ctrl+C the item in-game).')
        return
      }
      setPasteHint(null)
      pushState({
        ...state,
        jewelType: parsed.jewelType,
        jewelName: parsed.jewelName,
        conqueror: parsed.conqueror,
        seed: parsed.seed,
      })
    } catch {
      setPasteHint('Could not read clipboard.')
    }
  }, [pushState, state])

  const openTree = useCallback(() => {
    window.api.timelessTree.show(state)
  }, [state])

  if (error) {
    return (
      <div className="flex-1 min-h-0 p-3 text-xs text-red-400">Failed to load Timeless Jewel calculator: {error}</div>
    )
  }

  if (!ready) {
    return (
      <div className="flex-1 min-h-0 p-3 text-xs text-text-dim flex items-center justify-center">
        Loading Timeless Jewel engine…
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2 p-3 text-xs overflow-hidden">
      <div className="shrink-0 space-y-1">
        <div className="flex items-center gap-2">
          {jewelIconUrl(state.jewelName) && (
            <img src={jewelIconUrl(state.jewelName)} alt="" className="w-7 h-7 object-contain" draggable={false} />
          )}
          <div className="text-[13px] font-semibold text-text">Timeless Jewels</div>
        </div>
        <p className="text-text-dim leading-snug">
          Paste a Timeless Jewel, pick a socket on the skill tree, and list all transformed stats in radius (Notables /
          Smalls). Engine by <span className="text-accent">Vilsol/timeless-jewels</span> (GPL-3.0).
        </p>
      </div>

      <div className="shrink-0 flex flex-wrap gap-2">
        <button type="button" className="primary text-[11px] px-3 py-1.5" onClick={() => void onPaste()}>
          Paste from clipboard
        </button>
        <button type="button" className="text-[11px] px-3 py-1.5 border border-border" onClick={openTree}>
          Open skill tree
        </button>
      </div>
      {pasteHint && <div className="text-[11px] text-amber-400 shrink-0">{pasteHint}</div>}

      <div className="shrink-0 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-text-dim">Jewel</span>
          <select
            className="bg-black/40 border border-border rounded px-2 py-1"
            value={state.jewelType}
            onChange={(e) => {
              const jewelType = Number(e.target.value) as JewelType
              const name = jewelOptions.find((j) => j.type === jewelType)?.name ?? state.jewelName
              const nextConquerors = conquerorsForJewel(jewelType)
              pushState({
                ...state,
                jewelType,
                jewelName: name,
                conqueror: nextConquerors.includes(state.conqueror) ? state.conqueror : (nextConquerors[0] ?? ''),
              })
            }}
          >
            {jewelOptions.map((j) => (
              <option key={j.type} value={j.type}>
                {j.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-text-dim">Conqueror</span>
          <select
            className="bg-black/40 border border-border rounded px-2 py-1"
            value={state.conqueror}
            onChange={(e) => pushState({ ...state, conqueror: e.target.value })}
          >
            {conquerorOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 col-span-2">
          <span className="text-text-dim">
            Seed
            {seedRange ? ` (${seedRange.Min}–${seedRange.Max})` : ''}
          </span>
          <input
            type="number"
            className="bg-black/40 border border-border rounded px-2 py-1"
            value={state.seed || ''}
            min={seedRange?.Min}
            max={seedRange?.Max}
            onChange={(e) => pushState({ ...state, seed: Number(e.target.value) || 0 })}
          />
        </label>
      </div>

      <div className="shrink-0 text-text-dim">
        Socket:{' '}
        {state.socketSkillId
          ? (drawnNodes[state.socketSkillId]?.name ?? `#${state.socketSkillId}`)
          : 'none — open the tree and click a jewel socket'}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden border border-border/60 rounded">
        <RadiusStatsPanel
          groups={groups}
          emptyHint={
            state.socketSkillId
              ? 'No transformed stats for this seed/socket.'
              : 'Open the skill tree and click a socket to list Notables and Smalls here.'
          }
        />
      </div>
    </div>
  )
}
