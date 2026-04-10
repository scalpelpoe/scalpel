import { readFileSync, writeFileSync } from 'fs'
import type { HistoryEntry } from '../shared/types'

interface Snapshot {
  entry: HistoryEntry
  /** Raw file content before the edit */
  content: string
}

const MAX_HISTORY = 30
let snapshots: Snapshot[] = []
let nextId = 1

/** Capture the current filter file content before an edit */
export function captureSnapshot(
  filterPath: string,
  action: HistoryEntry['action'],
  description: string,
  itemName?: string,
): void {
  try {
    const content = readFileSync(filterPath, 'utf-8')
    snapshots.push({
      entry: {
        id: nextId++,
        timestamp: Date.now(),
        description,
        action,
        itemName,
      },
      content,
    })
    // Trim oldest entries
    if (snapshots.length > MAX_HISTORY) {
      snapshots = snapshots.slice(snapshots.length - MAX_HISTORY)
    }
  } catch {
    // If we can't read the file, skip the snapshot
  }
}

/** Undo the most recent edit — restores the file and returns true if successful */
export function undoLast(filterPath: string): { ok: boolean; error?: string } {
  const snapshot = snapshots.pop()
  if (!snapshot) return { ok: false, error: 'Nothing to undo' }

  try {
    writeFileSync(filterPath, snapshot.content, 'utf-8')
    return { ok: true }
  } catch (err) {
    // Put it back if restore failed
    snapshots.push(snapshot)
    return { ok: false, error: String(err) }
  }
}

/** Get the history list (newest first) for display */
export function getHistory(): HistoryEntry[] {
  return snapshots.map((s) => s.entry).reverse()
}

/** Clear all history */
export function clearHistory(): void {
  snapshots = []
}
