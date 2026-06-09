import { useState } from 'react'
import { ReactSortable } from 'react-sortablejs'
import { AddOne, Drag } from '@icon-park/react'
import type { CheatSheetCategory } from '../../../../../../shared/types'
import { RemoveButton } from '../../../../components/RemoveButton'
import { createMomentumScrollHandler } from '../../../../shared/momentumScroll'
import { HotkeyField } from '../../../../components/primitives/HotkeyField'
import type { HotkeySlot } from '../../../../components/primitives/hotkey-collisions'
import { PlaceholderTile } from './PlaceholderTile'
import { ThumbnailTile } from './ThumbnailTile'
import { UrlPasteRow } from './UrlPasteRow'

interface CategoryCardProps {
  category: CheatSheetCategory
  index: number
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
  onError: (message: string, tone?: 'error' | 'warn') => void
  onUpdate: (next: CheatSheetCategory) => void
  onRemove: () => void
}

/** One row in the categories list. Holds the name input, the horizontally
 *  scrollable thumbnail strip with momentum-drag scrolling, the optional URL
 *  paste row, and the optional per-category hotkey. The `.category-grab`
 *  handle on the left is the only piece that initiates a card-reorder drag;
 *  text selection in the input and clicks on every interactive child work
 *  normally. */
export function CategoryCard({
  category,
  index,
  tryHotkey,
  onError,
  onUpdate,
  onRemove,
}: CategoryCardProps): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  const [showHotkey, setShowHotkey] = useState(category.hotkey !== '')
  const [urlInput, setUrlInput] = useState<string | null>(null)

  if (confirming) {
    return (
      <div className="bg-black/15 rounded p-[8px] flex items-center gap-2">
        <span className="text-xs text-text-dim flex-1">Delete category &quot;{category.name}&quot;?</span>
        <button onClick={onRemove} className="text-[11px] px-3 py-1 bg-danger/20">
          Confirm
        </button>
        <button onClick={() => setConfirming(false)} className="text-[11px] px-3 py-1">
          Cancel
        </button>
      </div>
    )
  }

  const addFromFile = async (): Promise<void> => {
    const added = await window.api.addCheatSheetFromFile(category.id)
    if (added.length === 0) return
    // Prepend new images so they land next to the placeholder (which sits at
    // the head of the strip). User expectation: "the slot I clicked is where
    // the new sheet appears."
    onUpdate({ ...category, sheets: [...added.map((a) => ({ id: a.id, ext: a.ext })), ...category.sheets] })
  }
  const addFromUrl = async (url: string): Promise<void> => {
    if (!url.trim()) return
    try {
      const added = await window.api.addCheatSheetFromUrl(category.id, url.trim())
      onUpdate({ ...category, sheets: [{ id: added.id, ext: added.ext }, ...category.sheets] })
      setUrlInput(null)
    } catch (e) {
      // Strip Electron's IPC rejection wrapper ("Error invoking remote
      // method 'foo': Error: <our message>") so the user sees just our
      // friendly copy in the banner.
      const raw = e instanceof Error ? e.message : String(e)
      onError(raw.replace(/^Error invoking remote method '[^']+': Error: /, ''))
    }
  }

  return (
    <div className="bg-black/15 rounded p-[5px] flex flex-col gap-1.5">
      {/* Name + remove */}
      <div className="flex gap-[6px] items-center">
        <div
          className="category-grab cursor-grab text-text-dim hover:text-text shrink-0 flex items-center justify-center w-5 h-5"
          title="Drag to reorder"
        >
          <Drag size={14} theme="outline" fill="currentColor" />
        </div>
        <input
          type="text"
          value={category.name}
          onChange={(e) => onUpdate({ ...category, name: e.target.value })}
          className="flex-1 text-xs h-[34px] box-border px-3 py-2 bg-black/30"
        />
        <RemoveButton onClick={() => setConfirming(true)} />
      </div>

      {/* Thumbnail strip - single row, horizontally scrollable with drag-and-
          momentum like the uniques-for-base strip. The negative inline margins
          let the scroll track run edge-to-edge of the card while paddingLeft/
          Right keeps the first/last tile inset to match the rest of the card
          content. mouseDown on the drag handle (.sheet-grab) or any button
          inside the row is ignored so reorder + click handlers still work. */}
      <div
        className="flex gap-2 overflow-x-auto overflow-y-hidden no-scrollbar no-drag -mx-[5px]"
        style={{ paddingLeft: 5, paddingRight: 5 }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={createMomentumScrollHandler(['.sheet-grab', 'button'])}
      >
        <PlaceholderTile onClickFile={addFromFile} onClickUrl={() => setUrlInput('')} />
        <ReactSortable
          list={category.sheets.map((s) => ({ ...s }))}
          // The list items are shallow copies of CheatSheet, so we can spread
          // them straight back without picking specific fields. Picking only
          // id+ext here previously stripped optional fields like areaCodes,
          // which fires on every mount even without a user drag.
          setList={(next) => onUpdate({ ...category, sheets: next.map((s) => ({ ...s })) })}
          animation={150}
          handle=".sheet-grab"
          className="contents"
        >
          {category.sheets.map((sheet) => (
            <ThumbnailTile
              key={sheet.id}
              categoryId={category.id}
              sheet={sheet}
              onRemove={() => {
                void window.api.removeCheatSheet(category.id, sheet.id, sheet.ext)
                onUpdate({ ...category, sheets: category.sheets.filter((s) => s.id !== sheet.id) })
              }}
            />
          ))}
        </ReactSortable>
      </div>

      {/* URL paste row - shown under the thumbnail strip when the user clicks
          the link half of the placeholder tile. Same setting-box chrome as
          the hotkey rows for visual consistency. */}
      {urlInput !== null && (
        <UrlPasteRow
          value={urlInput}
          onChange={setUrlInput}
          onSubmit={() => addFromUrl(urlInput ?? '')}
          onCancel={() => setUrlInput(null)}
        />
      )}

      {/* Per-category hotkey (optional) */}
      <div className="no-drag">
        {showHotkey || category.hotkey !== '' ? (
          <HotkeyField
            value={category.hotkey}
            onChange={(hotkey) => {
              if (hotkey === '') {
                // User cleared via the field's built-in X - collapse the row
                // back to the "Add hotkey" button.
                onUpdate({ ...category, hotkey: '' })
                setShowHotkey(false)
                return
              }
              if (!tryHotkey(hotkey, { kind: 'cheatsheet-category', index })) return
              onUpdate({ ...category, hotkey })
            }}
          />
        ) : (
          <button
            onClick={() => setShowHotkey(true)}
            className="inline-flex items-center gap-1 leading-none text-[10px] text-text-dim px-2 py-1"
          >
            <AddOne size={10} theme="outline" fill="currentColor" className="flex" />
            <span className="leading-none relative -top-px">Add hotkey (optional)</span>
          </button>
        )}
      </div>
    </div>
  )
}
