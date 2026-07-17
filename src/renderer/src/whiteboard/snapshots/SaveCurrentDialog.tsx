import { useRef, useState } from 'react'
import { PANEL_CHROME } from '../toolbar/panel-chrome'
import { IconClose } from '../toolbar/icons'
import { useDismissOnOutside } from '../../shared/use-dismiss-on-outside'

interface Props {
  open: boolean
  /** When true, the dialog explains that current work will be cleared and
   *  exposes a "Discard" action. Used when about to load a different
   *  snapshot. When false, the dialog is a plain "save snapshot" prompt. */
  warnLoseWork: boolean
  onSave: (name: string) => void
  onDiscard: () => void
  onCancel: () => void
}

export function SaveCurrentDialog({ open, warnLoseWork, onSave, onDiscard, onCancel }: Props): JSX.Element | null {
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useDismissOnOutside(ref, onCancel, open)

  if (!open) return null
  return (
    /* See SnapshotLibrary for why the wrapper / inner split is needed:
     * `wb-pop-in` animates `transform`, which would clobber the centering
     * `translateX(-50%)` and pop the dialog off-center mid-mount. */
    <div ref={ref} className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)]">
      <div className={`w-[420px] flex flex-col wb-pop-in ${PANEL_CHROME}`}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border">
          <h3 className="section-title m-0">{warnLoseWork ? 'Want to save first?' : 'Save snapshot'}</h3>
          <button
            type="button"
            className="!bg-transparent !p-0 text-text-dim hover:text-text flex items-center"
            onClick={onCancel}
            title="Close"
          >
            <IconClose />
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {warnLoseWork && (
            <p className="text-xs text-text-dim m-0 leading-normal">
              Want to save this masterpiece first or discard it?
            </p>
          )}
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim().length > 0) onSave(name.trim())
            }}
            placeholder="Snapshot name"
            className="w-full bg-bg-solid border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-accent"
          />
          <div className="flex gap-2 justify-end items-center">
            <button type="button" className="!bg-transparent !text-text-dim hover:!text-text !px-2" onClick={onCancel}>
              Cancel
            </button>
            <div className="flex-1" />
            {warnLoseWork && (
              <button type="button" onClick={onDiscard} style={{ padding: '6px 14px' }}>
                Discard
              </button>
            )}
            <button
              type="button"
              className="primary"
              disabled={name.trim().length === 0}
              onClick={() => onSave(name.trim())}
              style={{ padding: '6px 14px' }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
