import { ReactSortable } from 'react-sortablejs'
import { CloseSmall, Drag } from '@icon-park/react'
import type { RegexPreset } from '../../../../shared/types'
import { TagSourceIcon, createMomentumScrollHandler, tagChipStyle } from './mapmods-helpers'

interface SavedPresetsProps {
  /** All saved presets. The strip renders only the subset whose `generator` matches
   *  the active generator tab; reorder writes back to the full list. */
  presets: RegexPreset[]
  setPresets: (presets: RegexPreset[]) => void
  /** Active generator tab. Presets with no generator are treated as 'maps'. */
  generator: 'maps' | 'custom'
  loadPreset: (preset: RegexPreset) => void
  deletePreset: (id: string) => void
}

/** Horizontal scrolling strip of saved preset cards. Cards drag-reorder via a grab
 *  handle, delete via the X, and load on click. Strip scrolls with momentum. */
export function SavedPresets({
  presets,
  setPresets,
  generator,
  loadPreset,
  deletePreset,
}: SavedPresetsProps): JSX.Element | null {
  const filtered = presets.filter((p) => (p.generator ?? 'maps') === generator)
  if (filtered.length === 0) return null

  return (
    <div className="border-b border-border bg-bg-card py-2">
      <span className="text-[9px] text-text-dim font-semibold uppercase tracking-wider ml-3 mb-1 block">
        Saved Regex
      </span>
      <div
        className="flex overflow-x-auto pb-1 preset-slider"
        style={{ paddingLeft: 12 }}
        onMouseDown={createMomentumScrollHandler(['.preset-grab', '.preset-delete'])}
      >
        <ReactSortable
          list={filtered}
          setList={(newList) => {
            // Merge reordered filtered presets back with the rest (other generator's
            // presets stay put at the start of the combined list).
            const otherPresets = presets.filter((p) => (p.generator ?? 'maps') !== generator)
            const merged = [...otherPresets, ...newList]
            setPresets(merged)
            window.api.reorderRegexPresets(merged.map((p) => p.id))
          }}
          animation={150}
          handle=".preset-grab"
          filter=".preset-delete"
          preventOnFilter={false}
          className="flex gap-2"
        >
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex shrink-0 rounded bg-black/20 hover:bg-black/30 transition-colors cursor-pointer relative group"
              style={{ width: 160, minHeight: 60 }}
              onClick={() => loadPreset(p)}
            >
              {/* Left strip: X delete + grab handle. Hidden until hover to keep the
                  card clean while browsing. */}
              <div className="flex flex-col items-center py-1.5 px-[3px] opacity-0 group-hover:opacity-100 transition-opacity preset-controls">
                <div
                  onClick={(e) => {
                    e.stopPropagation()
                    deletePreset(p.id)
                  }}
                  className="preset-delete cursor-pointer text-text-dim hover:text-[#ef5350] transition-colors"
                >
                  <CloseSmall size={11} theme="outline" fill="currentColor" />
                </div>
                <div
                  className="preset-grab cursor-grab text-text-dim hover:text-text transition-colors flex-1 flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Drag size={10} theme="outline" fill="currentColor" />
                </div>
              </div>
              <div className="flex-1 p-2 pl-0 min-w-0">
                <div
                  className="flex flex-wrap gap-[3px]"
                  style={{ maxHeight: 68, overflow: 'hidden' }}
                  ref={(el) => {
                    if (el) {
                      // Fade the bottom of the chip wrap when it overflows so users know
                      // there are more tags than shown.
                      el.style.webkitMaskImage =
                        el.scrollHeight > el.clientHeight
                          ? 'linear-gradient(to bottom, black 75%, transparent 100%)'
                          : 'none'
                    }
                  }}
                >
                  {p.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-[3px] px-[5px] py-[1px] text-[9px] font-semibold shrink-0"
                      style={tagChipStyle(tag)}
                    >
                      <TagSourceIcon source={tag.source} size={8} />
                      {tag.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </ReactSortable>
        <div style={{ minWidth: 12, flexShrink: 0 }} />
      </div>
    </div>
  )
}
