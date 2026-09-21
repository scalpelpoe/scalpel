import { Drag } from '@icon-park/react'
import { useEffect, useRef, useState } from 'react'
import { ReactSortable } from 'react-sortablejs'
import type { RegexPreset, RuntimeSettings } from '@shared/types'
import { Chrome } from '../secondary-overlay/Chrome'
import { textColorForBg } from '../shared/regex-preset-colors'
import { getOverlayState } from '../shared/platform/api/overlay'
import { getSettings } from '../shared/platform/api/settings'
import {
  closeRegexRemote,
  getRegexPresets,
  onRegexPresetsChanged,
  onRegexRemoteMountChanged,
  regexRemoteApply,
  regexRemoteHandFocus,
  regexRemoteMountState,
  reorderRegexPresets,
} from '../shared/platform/api/regex'
import { applyGroupOrder, generatorOf } from './preset-order'

/** Generator display order + labels per game, for grouping the chips. This
 *  duplicates the canonical lists in RegexGenerator.tsx (GENERATORS_POE1 /
 *  GENERATORS_POE2), which aren't exported - importing them would pull the
 *  whole generator component tree into this overlay's bundle. If you add a
 *  generator there, add it here too or the pad will silently omit it. */
const GENERATOR_ORDER: Record<1 | 2, Array<{ key: string; label: string }>> = {
  1: [
    { key: 'maps', label: 'Maps' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'flasks', label: 'Flasks' },
    { key: 'items', label: 'Items' },
    { key: 'beasts', label: 'Beasts' },
    { key: 'custom', label: 'Custom' },
  ],
  2: [
    { key: 'waystones', label: 'Waystones' },
    { key: 'tablet', label: 'Tablet' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'relic', label: 'Relic' },
    { key: 'custom', label: 'Custom' },
  ],
}

export function RegexRemote(): JSX.Element {
  const [version, setVersion] = useState<1 | 2>(1)
  const [presets, setPresets] = useState<RegexPreset[]>([])
  const [macros, setMacros] = useState<RuntimeSettings['appMacros']>([])
  const [mounted, setMounted] = useState(true)
  const draggingRef = useRef(false)

  useEffect(() => {
    void getOverlayState().then((s) => {
      if (s.poeVersion === 1 || s.poeVersion === 2) setVersion(s.poeVersion)
    })
    void getSettings().then((s) => setMacros(s.appMacros ?? []))
  }, [])

  useEffect(() => {
    const load = (): void => void getRegexPresets().then(setPresets)
    load()
    return onRegexPresetsChanged(load)
  }, [])

  useEffect(() => {
    void regexRemoteMountState().then(setMounted)
    return onRegexRemoteMountChanged(setMounted)
  }, [])

  // Clicking the pad gives it OS focus; hand focus back to PoE when the cursor
  // leaves the window so the pad doesn't sit holding focus. Otherwise minimizing
  // or alt-tabbing PoE won't hide the pad (the PoE-blur hide bails while a
  // Scalpel window is focused), unlike the other secondary overlays.
  //
  // Suppressed mid-reorder: a drag that strays past the pad edge would
  // otherwise yank focus to the game and drop the row being dragged.
  useEffect(() => {
    const handBack = (): void => {
      if (!draggingRef.current) regexRemoteHandFocus()
    }
    document.addEventListener('mouseleave', handBack)
    return () => document.removeEventListener('mouseleave', handBack)
  }, [])

  const groups = GENERATOR_ORDER[version]
    .map((g) => ({
      ...g,
      items: presets.filter((p) => generatorOf(p) === g.key),
    }))
    .filter((g) => g.items.length > 0)

  const boundHotkey = (id: string): string | undefined =>
    macros.find((m) => m.action === 'useSavedRegex' && m.presetId === id)?.hotkey

  /** Persist a drag within one generator group. ReactSortable also fires this
   *  on mount and after re-renders, so no-ops bail before the IPC - a write
   *  broadcasts presets-changed to every other window. */
  const onSort = (generatorKey: string, next: RegexPreset[]): void => {
    const nextIds = next.map((p) => p.id)
    const currentIds = presets.filter((p) => generatorOf(p) === generatorKey).map((p) => p.id)
    if (nextIds.join('|') === currentIds.join('|')) return
    const order = applyGroupOrder(presets, generatorKey, nextIds)
    const byId = new Map(presets.map((p) => [p.id, p]))
    // Optimistic: the main process broadcasts the change to the OTHER windows,
    // so the pad never gets an echo of its own write to reload from.
    setPresets(order.flatMap((id) => byId.get(id) ?? []))
    void reorderRegexPresets(order)
  }

  return (
    <Chrome title="Regex Remote" onClose={() => closeRegexRemote()} flushLeft={mounted}>
      {groups.length === 0 ? (
        <div className="p-3 text-text-dim text-[11px] leading-snug">
          Save regex presets in the Regex tab to use them here.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-2 flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim px-1">{g.label}</div>
              <ReactSortable
                // Shallow copies: ReactSortable tags the items it is handed
                // (chosen/selected) and we don't want that landing in state.
                list={g.items.map((p) => ({ ...p }))}
                setList={(next) => onSort(g.key, next)}
                onStart={() => {
                  draggingRef.current = true
                }}
                onEnd={() => {
                  draggingRef.current = false
                }}
                animation={150}
                handle=".regex-remote-grab"
                className="flex flex-col gap-1"
              >
                {g.items.map((p) => {
                  const hk = boundHotkey(p.id)
                  const tinted = !!p.color
                  return (
                    <div
                      key={p.id}
                      className={`group flex items-center rounded overflow-hidden${tinted ? '' : ' text-text'}`}
                      style={{
                        background: p.color ?? 'rgba(255,255,255,0.08)',
                        color: tinted ? textColorForBg(p.color as string) : undefined,
                      }}
                    >
                      {/* Width is reserved even while hidden so revealing the
                          grip on hover doesn't shift the label. */}
                      <span
                        className="regex-remote-grab cursor-grab shrink-0 w-[14px] flex items-center justify-center self-stretch opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Drag to reorder"
                        data-testid={`grab-${p.id}`}
                      >
                        <Drag size={10} theme="outline" fill="currentColor" />
                      </span>
                      <button
                        onClick={() => regexRemoteApply(p.id)}
                        className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left pl-1 pr-2 py-[6px] text-[11px] font-medium cursor-pointer border-none text-inherit"
                        // The chip's tint lives on the wrapper now, so this
                        // button must stay see-through. It has to be inline:
                        // styles.css's `button:hover`/`:active` grey overlay
                        // outranks a Tailwind bg-transparent class and would
                        // wash the preset colour out on hover (same reason
                        // button.bg-accent:hover exists over there).
                        style={{ background: 'transparent' }}
                      >
                        <span className="truncate">{p.name || 'Untitled'}</span>
                        {hk && <span className="text-[9px] opacity-70 shrink-0">{hk}</span>}
                      </button>
                    </div>
                  )
                })}
              </ReactSortable>
            </div>
          ))}
        </div>
      )}
    </Chrome>
  )
}
