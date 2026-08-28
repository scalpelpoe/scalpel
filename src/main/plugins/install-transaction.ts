import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

interface FileSnapshot {
  path: string
  contents: string | null
}

export function snapshotFiles(paths: string[]): FileSnapshot[] {
  return paths.map((path) => ({ path, contents: existsSync(path) ? readFileSync(path, 'utf-8') : null }))
}

export function restoreFiles(snapshots: FileSnapshot[]): void {
  let firstError: unknown = null
  for (const snapshot of snapshots) {
    try {
      if (snapshot.contents === null) {
        rmSync(snapshot.path, { force: true })
      } else {
        mkdirSync(dirname(snapshot.path), { recursive: true })
        writeFileSync(snapshot.path, snapshot.contents)
      }
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError) throw firstError
}

export function replacePackageAtomically(
  destDir: string,
  stage: (incomingDir: string) => void,
  commitMetadata: () => void,
  rollbackMetadata: () => void,
): void {
  const incomingDir = `${destDir}.incoming`
  const backupDir = `${destDir}.backup`
  let hadPrevious = false
  let swapped = false
  let metadataStarted = false

  try {
    rmSync(incomingDir, { recursive: true, force: true })
    mkdirSync(incomingDir, { recursive: true })
    stage(incomingDir)

    rmSync(backupDir, { recursive: true, force: true })
    hadPrevious = existsSync(destDir)
    if (hadPrevious) renameSync(destDir, backupDir)
    try {
      renameSync(incomingDir, destDir)
      swapped = true
    } catch (error) {
      if (hadPrevious) renameSync(backupDir, destDir)
      throw error
    }

    metadataStarted = true
    commitMetadata()
  } catch (error) {
    let rollbackError: unknown = null
    if (metadataStarted) {
      try {
        rollbackMetadata()
      } catch (caught) {
        rollbackError = caught
      }
    }
    try {
      if (swapped) {
        rmSync(destDir, { recursive: true, force: true })
        if (hadPrevious) renameSync(backupDir, destDir)
      }
      rmSync(incomingDir, { recursive: true, force: true })
    } catch (caught) {
      rollbackError ??= caught
    }
    if (rollbackError) {
      throw new Error(`${(error as Error).message}; rollback failed: ${(rollbackError as Error).message}`)
    }
    throw error
  }

  try {
    rmSync(backupDir, { recursive: true, force: true })
  } catch {
    // The new package and metadata are committed; a stale backup is safe and
    // will be removed before the next replacement attempt.
  }
}
