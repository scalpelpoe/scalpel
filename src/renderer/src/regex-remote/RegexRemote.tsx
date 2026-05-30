import { useEffect, useState } from 'react'
import type { RegexPreset, RuntimeSettings } from '../../../shared/types'
import { Chrome } from '../secondary-overlay/Chrome'
import { textColorForBg } from '../components/regex-tool/preset-colors'

/** Generator display order + labels per game, for grouping the chips. This
 *  duplicates the canonical lists in RegexGenerator.tsx (GENERATORS_POE1 /
 *  GENERATORS_POE2), which aren't exported - importing them would pull the
 *  whole generator component tree into this overlay's bundle. If you add a
 *  generator there, add it here too or the pad will silently omit it. */
const GENERATOR_ORDER: Record<1 | 2, Array<{ key: string; label: string }>> = {
  1: [
    { key: 'maps', label: 'Maps' },
    { key: 'flasks', label: 'Flasks' },
    { key: 'custom', label: 'Custom' },
  ],
  2: [
    { key: 'waystones', label: 'Waystones' },
    { key: 'custom', label: 'Custom' },
  ],
}

export function RegexRemote(): JSX.Element {
  const [version, setVersion] = useState<1 | 2>(1)
  const [presets, setPresets] = useState<RegexPreset[]>([])
  const [macros, setMacros] = useState<RuntimeSettings['appMacros']>([])
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    void window.api.getOverlayState().then((s) => {
      if (s.poeVersion === 1 || s.poeVersion === 2) setVersion(s.poeVersion)
    })
    void window.api.getSettings().then((s) => setMacros(s.appMacros ?? []))
  }, [])

  useEffect(() => {
    const load = (): void => void window.api.getRegexPresets().then(setPresets)
    load()
    return window.api.onRegexPresetsChanged(load)
  }, [])

  useEffect(() => {
    void window.api.regexRemoteMountState().then(setMounted)
    return window.api.onRegexRemoteMountChanged(setMounted)
  }, [])

  // Clicking the pad gives it OS focus; hand focus back to PoE when the cursor
  // leaves the window so the pad doesn't sit holding focus. Otherwise minimizing
  // or alt-tabbing PoE won't hide the pad (the PoE-blur hide bails while a
  // Scalpel window is focused), unlike the other secondary overlays.
  useEffect(() => {
    const handBack = (): void => window.api.regexRemoteHandFocus()
    document.addEventListener('mouseleave', handBack)
    return () => document.removeEventListener('mouseleave', handBack)
  }, [])

  const groups = GENERATOR_ORDER[version]
    .map((g) => ({
      ...g,
      items: presets.filter((p) => (p.generator ?? 'maps') === g.key),
    }))
    .filter((g) => g.items.length > 0)

  const boundHotkey = (id: string): string | undefined =>
    macros.find((m) => m.action === 'useSavedRegex' && m.presetId === id)?.hotkey

  return (
    <Chrome
      headerContent={<span className="text-text text-xs font-semibold">Regex Remote</span>}
      onClose={() => window.api.closeRegexRemote()}
      flushLeft={mounted}
    >
      {groups.length === 0 ? (
        <div className="p-3 text-text-dim text-[11px] leading-snug">
          Save regex presets in the Regex tab to use them here.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar p-2 flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-text-dim px-1">{g.label}</div>
              {g.items.map((p) => {
                const hk = boundHotkey(p.id)
                const tinted = !!p.color
                return (
                  <button
                    key={p.id}
                    onClick={() => window.api.regexRemoteApply(p.id)}
                    className={`flex items-center justify-between gap-2 w-full text-left px-2 py-[6px] rounded text-[11px] font-medium cursor-pointer border-none${tinted ? '' : ' text-text'}`}
                    style={{
                      background: p.color ?? 'rgba(255,255,255,0.08)',
                      color: tinted ? textColorForBg(p.color as string) : undefined,
                    }}
                  >
                    <span className="truncate">{p.name || 'Untitled'}</span>
                    {hk && <span className="text-[9px] opacity-70 shrink-0">{hk}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </Chrome>
  )
}
