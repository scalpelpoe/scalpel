import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// whiteboard.ts registers an ipcMain listener at module scope after Task 20,
// so the mock must be installed before the module is imported.
vi.mock('electron', () => ({
  app: { getPath: vi.fn() },
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeListener: vi.fn() },
  screen: { getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })) },
}))

import { emptyBoardState } from '../../shared/whiteboard-types'
import { __setUserDataDirForTests } from '../whiteboard'
import {
  __handleDeleteSnapshot,
  __handleLoad,
  __handleRenameSnapshot,
  __handleSaveActive,
  __handleSaveAsSnapshot,
} from './whiteboard'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'wb-handlers-'))
  __setUserDataDirForTests(tmp)
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  __setUserDataDirForTests(null)
})

describe('whiteboard handlers', () => {
  it('round-trips active state', async () => {
    const initial = await __handleLoad(1, { w: 1920, h: 1080 })
    expect(initial.active.elements).toEqual([])

    const next = emptyBoardState({ w: 1920, h: 1080 })
    next.elements.push({
      id: 'a',
      z: 0,
      rotation: 0,
      type: 'stroke',
      variant: 'pen',
      points: [{ x: 0.5, y: 0.5 }],
      color: '#ff0000',
      width: 0.005,
    })
    await __handleSaveActive(1, next)

    const reloaded = await __handleLoad(1, { w: 1, h: 1 })
    expect(reloaded.active.elements).toHaveLength(1)
  })

  it('save-as-snapshot prepends to the list and returns an id', async () => {
    const state = emptyBoardState({ w: 1, h: 1 })
    const { id } = await __handleSaveAsSnapshot(1, { name: 'Boss strats', state })
    const lib = await __handleLoad(1, { w: 1, h: 1 })
    expect(lib.snapshots).toHaveLength(1)
    expect(lib.snapshots[0].id).toBe(id)
    expect(lib.snapshots[0].name).toBe('Boss strats')

    await __handleSaveAsSnapshot(1, { name: 'Loot rules', state })
    const lib2 = await __handleLoad(1, { w: 1, h: 1 })
    expect(lib2.snapshots[0].name).toBe('Loot rules')
    expect(lib2.snapshots[1].name).toBe('Boss strats')
  })

  it('delete-snapshot removes by id', async () => {
    const state = emptyBoardState({ w: 1, h: 1 })
    const { id: a } = await __handleSaveAsSnapshot(1, { name: 'A', state })
    await __handleSaveAsSnapshot(1, { name: 'B', state })
    const updated = await __handleDeleteSnapshot(1, { id: a })
    expect(updated).toHaveLength(1)
    expect(updated[0].name).toBe('B')
  })

  it('rename-snapshot updates the name', async () => {
    const state = emptyBoardState({ w: 1, h: 1 })
    const { id } = await __handleSaveAsSnapshot(1, { name: 'old', state })
    const updated = await __handleRenameSnapshot(1, { id, name: 'new' })
    expect(updated.find((s) => s.id === id)?.name).toBe('new')
  })

  it('delete-snapshot returns empty when no library file exists', async () => {
    const result = await __handleDeleteSnapshot(2, { id: 'never-existed' })
    expect(result).toEqual([])
  })

  it('rename-snapshot returns empty when no library file exists', async () => {
    const result = await __handleRenameSnapshot(2, { id: 'never-existed', name: 'anything' })
    expect(result).toEqual([])
  })
})
