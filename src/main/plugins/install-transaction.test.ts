import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const failingRenames = new Set<string>()

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return {
    ...real,
    renameSync: (from: string, to: string) => {
      const key = `${from}->${to}`
      if (failingRenames.has(key)) {
        failingRenames.delete(key)
        throw new Error(`EPERM: ${key}`)
      }
      real.renameSync(from, to)
    },
  }
})

describe('replacePackageAtomically', () => {
  let root: string
  let destDir: string

  beforeEach(() => {
    failingRenames.clear()
    root = mkdtempSync(join(tmpdir(), 'scalpel-install-transaction-'))
    destDir = join(root, 'demo')
    mkdirSync(destDir)
    writeFileSync(join(destDir, 'plugin.js'), 'old')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const stageNew = (incomingDir: string): void => {
    writeFileSync(join(incomingDir, 'plugin.js'), 'new')
  }

  it('restores the previous install when the swap into place fails', async () => {
    const { replacePackageAtomically } = await import('./install-transaction')
    failingRenames.add(`${destDir}.incoming->${destDir}`)

    expect(() =>
      replacePackageAtomically(
        destDir,
        stageNew,
        () => {},
        () => {},
      ),
    ).toThrow(/EPERM/)

    expect(readFileSync(join(destDir, 'plugin.js'), 'utf-8')).toBe('old')
    expect(existsSync(`${destDir}.backup`)).toBe(false)
    expect(existsSync(`${destDir}.incoming`)).toBe(false)
  })

  it('keeps a stranded backup and recovers it on the next attempt', async () => {
    const { replacePackageAtomically } = await import('./install-transaction')
    failingRenames.add(`${destDir}.incoming->${destDir}`)
    failingRenames.add(`${destDir}.backup->${destDir}`)

    expect(() =>
      replacePackageAtomically(
        destDir,
        stageNew,
        () => {},
        () => {},
      ),
    ).toThrow(/rollback failed/)
    expect(existsSync(destDir)).toBe(false)
    expect(readFileSync(join(`${destDir}.backup`, 'plugin.js'), 'utf-8')).toBe('old')

    // The next attempt fails while staging: the old install must be back in
    // place rather than deleted along with the stale backup.
    expect(() =>
      replacePackageAtomically(
        destDir,
        () => {
          throw new Error('stage failed')
        },
        () => {},
        () => {},
      ),
    ).toThrow(/stage failed/)
    expect(readFileSync(join(destDir, 'plugin.js'), 'utf-8')).toBe('old')
    expect(existsSync(`${destDir}.backup`)).toBe(false)
  })
})
