import { CloseSmall, Drag } from '@icon-park/react'

/** Single image tile in a category's thumbnail strip. Hover reveals the
 *  reorder grip (top-left, drives the .sheet-grab handle for ReactSortable)
 *  and the X-remove button (top-right). */
export function ThumbnailTile({
  categoryId,
  sheet,
  onRemove,
}: {
  categoryId: string
  sheet: { id: string; ext: string }
  onRemove: () => void
}): JSX.Element {
  const src = `cheatsheet://${categoryId}/${sheet.id}.${sheet.ext}?thumb=1`
  return (
    <div className="relative group shrink-0 rounded overflow-hidden bg-black/30" style={{ width: 80, height: 60 }}>
      {/* draggable=false disables Chromium's native HTML5 image-drag (the
          translucent ghost it creates would otherwise hijack our momentum-
          scroll mousedown). Our reorder drag (.sheet-grab + ReactSortable)
          uses separate mousedown tracking and is unaffected. */}
      <img src={src} alt="" draggable={false} className="w-full h-full object-cover" />
      <div
        className="sheet-grab cursor-grab absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 rounded-full p-0.5 text-text-dim hover:text-text"
        title="Drag to reorder"
      >
        <Drag size={10} theme="outline" fill="currentColor" />
      </div>
      <button
        onClick={onRemove}
        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 rounded-full p-0.5"
        title="Remove image"
      >
        <CloseSmall size={10} theme="outline" fill="currentColor" />
      </button>
    </div>
  )
}
