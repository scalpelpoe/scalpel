import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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

import { emptyBoardLibrary } from '../shared/whiteboard-types'
import { __setUserDataDirForTests, loadLibrary, saveLibrary } from './whiteboard'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'wb-'))
  __setUserDataDirForTests(tmp)
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  __setUserDataDirForTests(null)
})

describe('loadLibrary', () => {
  it('returns an empty library when no file exists', () => {
    const lib = loadLibrary(1, { w: 1920, h: 1080 })
    expect(lib.active.elements).toEqual([])
    expect(lib.snapshots).toEqual([])
  })

  it('returns the library on a valid file round-trip', () => {
    const seed = emptyBoardLibrary({ w: 1920, h: 1080 })
    seed.active.elements.push({
      id: 'a',
      z: 0,
      rotation: 0,
      type: 'stroke',
      variant: 'pen',
      points: [{ x: 0.1, y: 0.2 }],
      color: '#ff0000',
      width: 0.005,
    })
    saveLibrary(1, seed)
    const got = loadLibrary(1, { w: 1, h: 1 })
    expect(got.active.elements).toHaveLength(1)
  })

  it('quarantines a corrupt file and returns empty', () => {
    const path = join(tmp, 'whiteboard', 'poe1.json')
    writeFileSync(path, 'not json', { encoding: 'utf-8' })
    const lib = loadLibrary(1, { w: 1, h: 1 })
    expect(lib.active.elements).toEqual([])
    const dir = readdirSync(join(tmp, 'whiteboard'))
    expect(dir.some((f) => f.startsWith('poe1.json.broken-'))).toBe(true)
  })

  it('separates poe1 and poe2 files', () => {
    const a = emptyBoardLibrary({ w: 1, h: 1 })
    a.active.elements.push({
      id: 'x',
      z: 0,
      rotation: 0,
      type: 'stroke',
      variant: 'pen',
      points: [],
      color: '#000',
      width: 0.001,
    })
    saveLibrary(1, a)
    const fromTwo = loadLibrary(2, { w: 1, h: 1 })
    expect(fromTwo.active.elements).toEqual([])
  })
})

describe('saveLibrary', () => {
  it('writes atomically (no .tmp file left behind on success)', () => {
    saveLibrary(1, emptyBoardLibrary({ w: 1, h: 1 }))
    const dir = readdirSync(join(tmp, 'whiteboard'))
    expect(dir.some((f) => f.endsWith('.tmp'))).toBe(false)
    expect(existsSync(join(tmp, 'whiteboard', 'poe1.json'))).toBe(true)
  })
})
