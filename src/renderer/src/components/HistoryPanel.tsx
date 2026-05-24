import { useEffect, useState } from 'react'
import type { FilterVersion, HistoryEntry, PoeItem } from '../../../shared/types'
import { Save, Pin } from '@icon-park/react'
import { IP, iconMap } from '../shared/constants'

interface Props {
  item?: PoeItem
}

const ACTION_FALLBACK_ICONS: Record<HistoryEntry['action'], string> = {
  'block-edit': '✏',
  'tier-move': '↕',
  'stack-threshold': '📊',
  'strand-threshold': '📊',
}

export function HistoryPanel({ item }: Props): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [versions, setVersions] = useState<FilterVersion[]>([])
  const [undoingId, setUndoingId] = useState<number | null>(null)
  const [restoringFile, setRestoringFile] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkpointLabel, setCheckpointLabel] = useState('')
  const [showCheckpointInput, setShowCheckpointInput] = useState(false)

  const refresh = (): void => {
    window.api.getHistory().then(setEntries)
    window.api.listVersions().then(setVersions)
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleUndo = async (entryId: number): Promise<void> => {
    setUndoingId(entryId)
    setError(null)
    const result = await window.api.undoEdit(item ? JSON.stringify(item) : undefined)
    setUndoingId(null)
    if (result.ok) {
      refresh()
    } else {
      setError(result.error ?? 'Failed to undo')
    }
  }

  const handleCreateCheckpoint = async (): Promise<void> => {
    setError(null)
    const result = await window.api.createCheckpoint(checkpointLabel || undefined)
    if (result.ok) {
      setCheckpointLabel('')
      setShowCheckpointInput(false)
      refresh()
    } else {
      setError(result.error ?? 'Failed to create checkpoint')
    }
  }

  const handleRestore = async (filename: string): Promise<void> => {
    setRestoringFile(filename)
    setError(null)
    const result = await window.api.restoreVersion(filename, item ? JSON.stringify(item) : undefined)
    setRestoringFile(null)
    setConfirmRestore(null)
    if (result.ok) {
      refresh()
    } else {
      setError(result.error ?? 'Failed to restore')
    }
  }

  const handleDelete = async (filename: string): Promise<void> => {
    await window.api.deleteVersion(filename)
    refresh()
  }

  const formatTime = (ts: number): string => {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - ts
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`

    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col gap-3 mt-3">
      {/* Session undo history */}
      <div>
        <div className="settings-section-title mb-3">Session Edits</div>

        {error && <div className="text-[11px] text-danger mb-2 px-0.5">{error}</div>}

        {entries.length === 0 ? (
          <div className="p-4 text-center text-text-dim">
            <div className="text-xs">No edits yet this session.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 max-h-[360px] overflow-y-auto">
            {entries.map((entry, i) => {
              const isLatest = i === 0
              const itemIconUrl = entry.itemName ? iconMap[entry.itemName] : undefined
              const isUndoing = undoingId === entry.id
              const canUndo = isLatest && undoingId === null

              return (
                <div
                  key={entry.id}
                  className={
                    'flex items-center gap-2 rounded' +
                    (isLatest ? ' transition-colors duration-150 hover:bg-white/[0.06]' : '')
                  }
                  style={{ padding: '7px 8px' }}
                >
                  <div className="w-[22px] h-[22px] shrink-0 flex items-center justify-center">
                    {itemIconUrl ? (
                      <img
                        src={itemIconUrl}
                        alt=""
                        className="w-[22px] h-[22px] object-contain"
                        style={{ imageRendering: 'auto' }}
                      />
                    ) : (
                      <span className="text-sm leading-[22px]">{ACTION_FALLBACK_ICONS[entry.action]}</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[11px] leading-4 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{
                        color: isLatest ? 'var(--text)' : 'var(--text-dim)',
                      }}
                    >
                      {entry.itemName && <span className="font-bold">{entry.itemName}: </span>}
                      {entry.description}
                    </div>
                    <div className="text-[9px] text-text-dim mt-px">{formatTime(entry.timestamp)}</div>
                  </div>

                  {isLatest ? (
                    <button
                      onClick={() => handleUndo(entry.id)}
                      disabled={!canUndo}
                      title="Undo this change"
                      className="shrink-0 text-[10px] font-semibold px-2 py-[3px] text-[#171821] bg-accent"
                      style={{
                        opacity: isUndoing ? 0.5 : 1,
                        cursor: canUndo ? 'pointer' : 'default',
                      }}
                    >
                      {isUndoing ? '...' : '↩ Undo'}
                    </button>
                  ) : (
                    <span className="shrink-0 text-[9px] text-text-dim text-center w-[52px] opacity-40">-</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Filter versions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="settings-section-title">Filter Versions</div>
          {showCheckpointInput ? (
            <div className="flex gap-1 items-center">
              <input
                type="text"
                placeholder="Label (optional)"
                value={checkpointLabel}
                onChange={(e) => setCheckpointLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateCheckpoint()
                  if (e.key === 'Escape') setShowCheckpointInput(false)
                }}
                autoFocus
                className="w-[120px] px-1.5 py-[3px] text-[10px] bg-black/30"
              />
              <button
                onClick={handleCreateCheckpoint}
                className="text-[10px] font-semibold px-2 py-[3px] text-[#171821] bg-accent"
              >
                Save
              </button>
              <button onClick={() => setShowCheckpointInput(false)} className="px-1.5 py-[3px] text-[10px]">
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowCheckpointInput(true)}
              className="text-[10px] font-semibold px-[10px] py-[3px] text-[#171821] bg-accent"
            >
              Create Checkpoint
            </button>
          )}
        </div>

        {versions.length === 0 ? (
          <div className="p-4 text-center text-text-dim text-xs">
            No versions saved yet. Versions are created automatically on launch.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 max-h-[360px] overflow-y-auto">
            {versions.map((v) => {
              const isConfirming = confirmRestore === v.filename
              const isRestoring = restoringFile === v.filename

              return (
                <div
                  key={v.filename}
                  className={
                    'flex items-center gap-2 transition-colors duration-150 hover:bg-white/[0.06]' +
                    (v.isCheckpoint ? ' bg-[rgba(200,169,110,0.06)]' : '')
                  }
                  style={{
                    padding: '7px 8px',
                    borderRadius: v.isCheckpoint ? 'var(--radius) 0 0 var(--radius)' : 'var(--radius)',
                  }}
                >
                  <div className="w-[22px] h-[22px] shrink-0 flex items-center justify-center text-xs">
                    {v.isCheckpoint ? <Pin size={14} {...IP} /> : <Save size={14} {...IP} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[11px] leading-4 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{
                        color: v.isCheckpoint ? 'var(--text)' : 'var(--text-dim)',
                      }}
                    >
                      {v.label || (v.isCheckpoint ? 'Checkpoint' : 'Auto-save')}
                      {v.filterName ? ` (${v.filterName})` : ''}
                    </div>
                    <div className="text-[9px] text-text-dim mt-px">{formatTime(v.timestamp)}</div>
                  </div>

                  {isConfirming ? (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleRestore(v.filename)}
                        disabled={isRestoring}
                        className="text-[10px] font-semibold text-white px-2 py-[3px] bg-danger"
                        style={{
                          opacity: isRestoring ? 0.5 : 1,
                        }}
                      >
                        {isRestoring ? '...' : 'Confirm'}
                      </button>
                      <button onClick={() => setConfirmRestore(null)} className="px-1.5 py-[3px] text-[10px]">
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => setConfirmRestore(v.filename)}
                        title="Restore this version"
                        className="px-2 py-[3px] text-[10px]"
                      >
                        Restore
                      </button>
                      {v.isCheckpoint && (
                        <button
                          onClick={() => handleDelete(v.filename)}
                          title="Delete this checkpoint"
                          className="text-text-dim px-1.5 py-[3px] text-[10px]"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
