import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { assertOverlayDependency } = require('./afterPack.js')

const tempDirs = []

function makeOverlayModule({ version = '4.1.0', wrapper = '', nativeStrings = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'scalpel-overlay-dependency-'))
  tempDirs.push(root)
  mkdirSync(join(root, 'dist'), { recursive: true })
  mkdirSync(join(root, 'build', 'Release'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version }))
  writeFileSync(join(root, 'dist', 'index.js'), wrapper)
  writeFileSync(join(root, 'build', 'Release', 'overlay_window.node'), nativeStrings.join('\0'))
  return root
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('afterPack electron-overlay-window validation', () => {
  it('accepts the compatible multi-title wrapper and native addon', () => {
    const moduleDir = makeOverlayModule({
      wrapper: 'attachByTitles() {} setTargetTitles() {}',
      nativeStrings: ['setTargetTitles', 'clearTarget', 'stopHook'],
    })

    expect(assertOverlayDependency(moduleDir)).toContain('overlay_window.node')
  })

  it('rejects the stale single-title wrapper that caused startup failure', () => {
    const moduleDir = makeOverlayModule({
      version: '4.0.2',
      wrapper: 'attachByTitle() {}',
      nativeStrings: ['setTargetTitles', 'clearTarget', 'stopHook'],
    })

    expect(() => assertOverlayDependency(moduleDir)).toThrow('4.0.2 is installed; 4.1.0 is required')
  })

  it('rejects an old native addon behind a current wrapper', () => {
    const moduleDir = makeOverlayModule({
      wrapper: 'attachByTitles() {} setTargetTitles() {}',
      nativeStrings: ['start', 'focusTarget'],
    })

    expect(() => assertOverlayDependency(moduleDir)).toThrow('has no native addon')
  })
})
