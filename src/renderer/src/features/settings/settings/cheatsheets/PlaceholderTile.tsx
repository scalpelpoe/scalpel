import { AddPicture, Link } from '@icon-park/react'

/** Split-button "add" tile that always sits at the head of the thumbnail
 *  strip. Left half opens the OS file picker, right half opens the URL paste
 *  row beneath the strip. Stays a fixed 80x60 so it doesn't compress in the
 *  scrollable flex row. */
export function PlaceholderTile({
  onClickFile,
  onClickUrl,
}: {
  onClickFile: () => void
  onClickUrl: () => void
}): JSX.Element {
  return (
    <div
      className="flex shrink-0 rounded border-2 border-dashed border-text-dim/40 bg-white/[0.04] overflow-hidden"
      style={{ width: 80, height: 60 }}
    >
      <button
        onClick={onClickFile}
        title="Add from file"
        className="flex-1 flex items-center justify-center text-text-dim hover:bg-white/[0.06] hover:text-accent transition-colors border-none bg-transparent rounded-none cursor-pointer"
      >
        <AddPicture size={18} theme="outline" fill="currentColor" />
      </button>
      <div className="w-px bg-text-dim/30 self-stretch" />
      <button
        onClick={onClickUrl}
        title="Add from URL"
        className="flex-1 flex items-center justify-center text-text-dim hover:bg-white/[0.06] hover:text-accent transition-colors border-none bg-transparent rounded-none cursor-pointer"
      >
        <Link size={16} theme="outline" fill="currentColor" />
      </button>
    </div>
  )
}
