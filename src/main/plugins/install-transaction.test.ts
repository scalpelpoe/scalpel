import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const RESTORE_MARKER = '.scalpel-restore-pending'

const failingRenames = new Set<string>()
const failingRemovals = new Set<string>()

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
    rmSync: (path: string, options?: Parameters<typeof real.rmSync>[1]) => {
      if (failingRemovals.has(path)) {
        failingRemovals.delete(path)
        throw new Error(`EBUSY: ${path}`)
      }
      real.rmSync(path, options)
    },
  }
})

describe('replacePackageAtomically', () => {
  let root: string
  let destDir: string

  beforeEach(() => {
    failingRenames.clear()
    failingRemovals.clear()
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

  // Swap succeeds, the metadata commit fails, and clearing the half-installed
  // destination fails too: the destination is left torn and the backup holds the
  // only good copy of the previous install.
  const tearTheRollback = async (): Promise<void> => {
    const { replacePackageAtomically } = await import('./install-transaction')
    failingRemovals.add(destDir)

    expect(() =>
      replacePackageAtomically(
        destDir,
        stageNew,
        () => {
          throw new Error('commit failed')
        },
        () => {},
      ),
    ).toThrow(/rollback failed/)
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

  it('torn rollback keeps the backup and the next attempt restores it', async () => {
    const { replacePackageAtomically } = await import('./install-transaction')
    await tearTheRollback()

    // The destination holds a torn copy of the new package and the backup is
    // flagged as the authoritative one.
    expect(readFileSync(join(destDir, 'plugin.js'), 'utf-8')).toBe('new')
    expect(existsSync(join(`${destDir}.backup`, RESTORE_MARKER))).toBe(true)
    expect(readFileSync(join(`${destDir}.backup`, 'plugin.js'), 'utf-8')).toBe('old')

    // A clean retry restores the backup first, then installs the new package.
    replacePackageAtomically(
      destDir,
      stageNew,
      () => {},
      () => {},
    )
    expect(readFileSync(join(destDir, 'plugin.js'), 'utf-8')).toBe('new')
    expect(existsSync(`${destDir}.backup`)).toBe(false)
    expect(existsSync(join(destDir, RESTORE_MARKER))).toBe(false)
  })

  it('torn rollback followed by a failing attempt restores the old package, not the torn one', async () => {
    const { replacePackageAtomically } = await import('./install-transaction')
    await tearTheRollback()

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
    expect(existsSync(join(destDir, RESTORE_MARKER))).toBe(false)
    expect(existsSync(`${destDir}.backup`)).toBe(false)
  })
})
