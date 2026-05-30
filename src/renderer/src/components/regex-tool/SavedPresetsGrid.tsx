import { useCallback, useEffect, useRef, useState } from 'react'
import { CloseSmall } from '@icon-park/react'
import type { RegexPreset } from '../../../../shared/types'
import { prettyHotkey } from '../settings/utils'
import { textColorForBg } from './preset-colors'

const FADE = 16

interface SavedPresetsGridProps {
  /** All saved presets. The grid renders only the subset whose `generator` matches
   *  the active generator tab. */
  presets: RegexPreset[]
  /** Active generator tab. Presets with no generator are treated as 'maps'
   *  (legacy default before the per-game split). */
  generator: 'maps' | 'custom' | 'flasks' | 'waystones'
  loadPreset: (preset: RegexPreset) => void
  deletePreset: (id: string) => void
  /** Returns a hotkey accelerator string if the preset has a bound macro, else undefined. */
  boundHotkeyFor: (preset: RegexPreset) => string | undefined
}

/** Wrapping grid of saved preset boxes. Newest-first, capped at ~3 rows then
 *  vertical scroll. Click loads, hover reveals delete button. Color-tinted left
 *  accent border when a color is set. Shows hotkey badge when a binding exists. */
export function SavedPresetsGrid({
  presets,
  generator,
  loadPreset,
  deletePreset,
  boundHotkeyFor,
}: SavedPresetsGridProps): JSX.Element | null {
  const filtered = presets.filter((p) => (p.generator ?? 'maps') === generator)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [fadeTop, setFadeTop] = useState(false)
  const [fadeBottom, setFadeBottom] = useState(false)

  const updateFades = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    setFadeTop(el.scrollTop > 1)
    setFadeBottom(el.scrollTop + el.clientHeight < el.scrollHeight - 1)
  }, [])

  // Measure after layout settles. A bare post-render call races flex/font
  // layout (overflow not yet known) so the fade was missing until first scroll;
  // an rAF + ResizeObserver catch the settled size, and the deps re-run it when
  // the list or active generator changes (tab switch with an equal row count).
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const raf = requestAnimationFrame(updateFades)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateFades) : null
    ro?.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [filtered.length, generator, updateFades])

  if (filtered.length === 0) return null

  const reversed = [...filtered].reverse()

  // Mask the edges that have content scrolled out of view so rows fade away
  // cleanly instead of clipping hard against the container.
  const topStop = fadeTop ? `transparent 0, black ${FADE}px` : 'black 0'
  const bottomStop = fadeBottom ? `black calc(100% - ${FADE}px), transparent 100%` : 'black 100%'
  const maskImage = fadeTop || fadeBottom ? `linear-gradient(to bottom, ${topStop}, ${bottomStop})` : 'none'

  return (
    <div className="border-b border-border bg-bg-card py-2">
      <span className="text-[9px] text-text-dim font-semibold uppercase tracking-wider ml-3 mb-1 block">
        Saved Regex
      </span>
      <div
        ref={scrollRef}
        onScroll={updateFades}
        className="flex flex-wrap gap-2 overflow-y-auto px-3 pb-2"
        style={{ maxHeight: 3 * 30 + 2 * 8, maskImage, WebkitMaskImage: maskImage }}
      >
        {reversed.map((p) => {
          const hotkey = boundHotkeyFor(p)
          const tinted = !!p.color
          return (
            <div
              key={p.id}
              role="button"
              tabIndex={0}
              className={`rounded cursor-pointer relative group flex items-center gap-2 pl-2 pr-[22px] py-[5px] overflow-hidden ${tinted ? '' : 'bg-black/20 hover:bg-black/30 text-text'}`}
              style={{
                minWidth: 80,
                maxWidth: 225,
                background: p.color,
                color: tinted ? textColorForBg(p.color as string) : undefined,
              }}
              onClick={() => loadPreset(p)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  loadPreset(p)
                }
              }}
            >
              <span className="text-[11px] font-semibold truncate min-w-0" title={p.name}>
                {p.name?.trim() || `Preset ${p.id.slice(0, 6)}`}
              </span>
              {hotkey && <span className="text-[9px] opacity-70 shrink-0">{prettyHotkey(hotkey)}</span>}
              {/* Delete - sits at the right edge, revealed on hover. */}
              <button
                className="absolute top-1/2 -translate-y-1/2 right-[4px] opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#ef5350] bg-black/25 rounded-full border-none cursor-pointer p-[2px] flex items-center justify-center"
                style={{ color: 'inherit' }}
                onClick={(e) => {
                  e.stopPropagation()
                  deletePreset(p.id)
                }}
                tabIndex={-1}
                aria-label="Delete preset"
              >
                <CloseSmall size={12} theme="outline" fill="currentColor" />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
