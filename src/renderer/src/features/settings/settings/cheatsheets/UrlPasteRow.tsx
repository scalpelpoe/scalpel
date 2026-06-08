import { CloseSmall } from '@icon-park/react'

/** Full-width URL paste row that appears under the thumbnails when the user
 *  clicks the link half of the placeholder tile. Mirrors the HotkeyField
 *  chrome (same setting-box height + right-cluster of buttons) so the form
 *  affordance reads the same across cheat-sheet rows. Errors from the
 *  fetch attempt are surfaced via the parent's onError banner, not inline -
 *  this component just owns the input + submit/cancel affordance. */
export function UrlPasteRow({
  value,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
}): JSX.Element {
  return (
    <div className="setting-box" style={{ cursor: 'auto' }}>
      <input
        autoFocus
        type="text"
        placeholder="Paste image URL"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
          if (e.key === 'Escape') onCancel()
        }}
        className="value flex-1 bg-transparent border-none outline-none p-0 m-0 min-w-0"
      />
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onCancel}
          title="Cancel"
          className="flex items-center justify-center w-5 h-5 shrink-0 rounded bg-white/[0.06] border-none cursor-pointer text-text-dim p-0 hover:bg-[rgba(239,83,80,0.2)] hover:text-white"
        >
          <CloseSmall size={14} theme="outline" fill="currentColor" className="flex" />
        </button>
        <button onClick={onSubmit} className="primary">
          Add
        </button>
      </div>
    </div>
  )
}
