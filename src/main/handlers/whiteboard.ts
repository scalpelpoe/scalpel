import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { BoardLibrary, BoardSnapshot, BoardState } from '../../shared/whiteboard-types'
import { loadExistingLibrary, loadLibrary, saveLibrary } from '../whiteboard'

type Version = 1 | 2

/** Per-version write lock. Each handler does load -> mutate -> save; without
 *  serialization, two concurrent handlers can load the same baseline and the
 *  second saver clobbers the first's mutation. The lock serializes the
 *  read-modify-write window so each handler sees the previous one's persisted
 *  result. Cross-version writes (poe1 vs poe2) are independent and don't
 *  block each other. */
const writeLocks: Record<Version, Promise<unknown>> = {
  1: Promise.resolve(),
  2: Promise.resolve(),
}

function withWriteLock<T>(version: Version, fn: () => T | Promise<T>): Promise<T> {
  const next = writeLocks[version].then(fn, fn)
  // Store the swallowed-error version so a thrown task doesn't poison the
  // chain; the actual error still propagates to *this* caller via `next`.
  writeLocks[version] = next.catch(() => undefined)
  return next
}

export async function __handleLoad(version: Version, gameSize: { w: number; h: number }): Promise<BoardLibrary> {
  return loadLibrary(version, gameSize)
}

export async function __handleSaveActive(version: Version, state: BoardState): Promise<void> {
  return withWriteLock(version, () => {
    const lib = loadLibrary(version, state.authoredAtGameSize)
    lib.active = state
    saveLibrary(version, lib)
  })
}

export async function __handleSaveAsSnapshot(
  version: Version,
  payload: { name: string; state: BoardState },
): Promise<{ id: string }> {
  return withWriteLock(version, () => {
    const lib = loadLibrary(version, payload.state.authoredAtGameSize)
    const snapshot: BoardSnapshot = {
      id: randomUUID(),
      name: payload.name,
      createdAt: Date.now(),
      state: payload.state,
    }
    lib.snapshots.unshift(snapshot)
    saveLibrary(version, lib)
    return { id: snapshot.id }
  })
}

export async function __handleDeleteSnapshot(version: Version, payload: { id: string }): Promise<BoardSnapshot[]> {
  return withWriteLock(version, () => {
    const lib = loadExistingLibrary(version)
    if (!lib) return []
    lib.snapshots = lib.snapshots.filter((s) => s.id !== payload.id)
    saveLibrary(version, lib)
    return lib.snapshots
  })
}

export async function __handleRenameSnapshot(
  version: Version,
  payload: { id: string; name: string },
): Promise<BoardSnapshot[]> {
  return withWriteLock(version, () => {
    const lib = loadExistingLibrary(version)
    if (!lib) return []
    lib.snapshots = lib.snapshots.map((s) => (s.id === payload.id ? { ...s, name: payload.name } : s))
    saveLibrary(version, lib)
    return lib.snapshots
  })
}

export function register(): void {
  ipcMain.handle('whiteboard:load', (_e, version: Version, gameSize: { w: number; h: number }) =>
    __handleLoad(version, gameSize),
  )
  ipcMain.on('whiteboard:save-active', (_e, version: Version, state: BoardState) => {
    void __handleSaveActive(version, state)
  })
  ipcMain.handle('whiteboard:save-as-snapshot', (_e, version: Version, payload: { name: string; state: BoardState }) =>
    __handleSaveAsSnapshot(version, payload),
  )
  ipcMain.handle('whiteboard:delete-snapshot', (_e, version: Version, payload: { id: string }) =>
    __handleDeleteSnapshot(version, payload),
  )
  ipcMain.handle('whiteboard:rename-snapshot', (_e, version: Version, payload: { id: string; name: string }) =>
    __handleRenameSnapshot(version, payload),
  )
}
