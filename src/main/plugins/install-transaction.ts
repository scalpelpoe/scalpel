import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Dropped inside the backup directory when a rollback could not put the backup
// back because the destination was still locked and held a torn package. Its
// presence tells the next attempt that the backup — not whatever is sitting at
// the destination — is the authoritative copy of the previous install.
const RESTORE_MARKER = '.scalpel-restore-pending'

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
    // A backup left behind by an earlier failed swap can be the only copy of the
    // previous install; put it back before discarding anything. It is the only
    // copy when the destination is missing, or when a torn rollback marked it as
    // pending restore. An unmarked backup next to an existing destination is
    // merely stale (a swallowed post-commit cleanup failure) and is dropped
    // below, before the swap.
    if (existsSync(backupDir)) {
      const restoreMarker = join(backupDir, RESTORE_MARKER)
      if (!existsSync(destDir) || existsSync(restoreMarker)) {
        // Clear the torn destination first: if it is still locked the attempt
        // aborts here with that error and the backup survives untouched.
        if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true })
        rmSync(restoreMarker, { force: true })
        renameSync(backupDir, destDir)
      }
    }
    rmSync(incomingDir, { recursive: true, force: true })
    mkdirSync(incomingDir, { recursive: true })
    stage(incomingDir)

    rmSync(backupDir, { recursive: true, force: true })
    hadPrevious = existsSync(destDir)
    if (hadPrevious) renameSync(destDir, backupDir)
    renameSync(incomingDir, destDir)
    swapped = true

    metadataStarted = true
    commitMetadata()
  } catch (error) {
    // Every undo step runs on its own: one failing step must not skip the rest,
    // least of all the step that puts the previous install back.
    let rollbackError: unknown = null
    if (metadataStarted) {
      try {
        rollbackMetadata()
      } catch (caught) {
        rollbackError ??= caught
      }
    }
    if (swapped) {
      try {
        rmSync(destDir, { recursive: true, force: true })
      } catch (caught) {
        rollbackError ??= caught
      }
    }
    if (hadPrevious && existsSync(backupDir)) {
      try {
        // A destination that is still there could not be cleared above, so it
        // holds a torn copy of the new package. Mark the backup instead of
        // deleting it: the next attempt must restore it rather than mistake it
        // for a stale leftover.
        if (existsSync(destDir)) writeFileSync(join(backupDir, RESTORE_MARKER), '')
        else renameSync(backupDir, destDir)
      } catch (caught) {
        rollbackError ??= caught
      }
    }
    try {
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
    // The new package and metadata are committed; a stale backup is safe. It
    // carries no restore marker, so the next replacement attempt discards it
    // instead of putting it back.
  }
}
