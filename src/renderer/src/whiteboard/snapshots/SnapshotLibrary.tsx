import { useEffect, useRef, useState } from 'react'
import type { BoardSnapshot } from '@shared/whiteboard-types'
import { PANEL_CHROME } from '../toolbar/panel-chrome'
import { IconClose, IconTrash } from '../toolbar/icons'
import { useDismissOnOutside } from '../../shared/use-dismiss-on-outside'

interface Props {
  open: boolean
  version: 1 | 2
  hasCurrentWork: boolean
  onPick: (snap: BoardSnapshot) => void
  onClose: () => void
  onDelete: (id: string) => void
  onSaveCurrent: () => void
}

export function SnapshotLibrary({
  open,
  version,
  hasCurrentWork,
  onPick,
  onClose,
  onDelete,
  onSaveCurrent,
}: Props): JSX.Element | null {
  const [snaps, setSnaps] = useState<BoardSnapshot[]>([])
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    window.api.whiteboard
      .load(version, { w: window.innerWidth, h: window.innerHeight })
      .then((lib) => setSnaps(lib.snapshots))
  }, [open, version])

  useDismissOnOutside(ref, onClose, open)

  if (!open) return null

  function handleDelete(id: string): void {
    window.api.whiteboard.deleteSnapshot(version, id).then((rest) => setSnaps(rest))
    onDelete(id)
  }

  return (
    /* Wrapper handles centering via translateX(-50%); inner div carries the
     * `wb-pop-in` animation. They have to be split because the keyframe
     * animates `transform`, which would otherwise clobber the centering
     * transform mid-mount and pop the dialog over to the right before
     * settling. */
    <div ref={ref} className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)]">
      <div className={`w-[460px] max-h-[60vh] flex flex-col wb-pop-in ${PANEL_CHROME}`}>
        <div className="flex justify-between items-center px-4 py-2.5 border-b border-border">
          <h3 className="section-title m-0">Snapshots</h3>
          <button
            type="button"
            className="!bg-transparent !p-0 text-text-dim hover:text-text flex items-center"
            onClick={onClose}
            title="Close"
          >
            <IconClose />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 min-h-[60px]">
          {snaps.length === 0 && (
            <div className="px-3 py-6 text-center">
              <div className="text-xs text-text-dim">No saved snapshots</div>
              <div className="text-[11px] text-text-dim/70 mt-1">Save your current canvas to keep it for later</div>
            </div>
          )}
          {snaps.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded px-3 py-2 hover:bg-bg-hover transition-colors">
              <div className="flex-1 truncate">
                <div className="text-sm text-text truncate">{s.name}</div>
                <div className="text-xs text-text-dim">{new Date(s.createdAt).toLocaleString()}</div>
              </div>
              <button
                type="button"
                className="primary text-[11px]"
                style={{ padding: '4px 12px' }}
                onClick={() => onPick(s)}
              >
                Open
              </button>
              <button
                type="button"
                className="!bg-transparent text-text-dim hover:!text-danger hover:!bg-danger/15 flex items-center justify-center"
                style={{ width: 28, height: 28, padding: 0 }}
                onClick={() => handleDelete(s.id)}
                title="Delete"
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-end items-center gap-2 px-4 py-2.5 border-t border-border">
          <button
            type="button"
            className="primary"
            disabled={!hasCurrentWork}
            onClick={onSaveCurrent}
            style={{ padding: '6px 14px' }}
          >
            Save current
          </button>
        </div>
      </div>
    </div>
  )
}
