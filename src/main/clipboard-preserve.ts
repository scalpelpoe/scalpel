import { platform } from '@scalpel/platform'

type Snapshot = { text: string; html: string }

/** The user's own clipboard, captured by the first borrower. Held until the
 *  last borrower releases. */
let pristine: Snapshot | null = null
let borrowers = 0

/** A borrow that outlives this is assumed leaked (a caller that threw past its
 *  restore) and is force-released, so one lost restore can't strand the user's
 *  clipboard forever. Every real flow is well under a second: the price-check
 *  capture tops out around 700ms, a chat paste around 50ms. */
const BORROW_TIMEOUT_MS = 10_000

function readSnapshot(): Snapshot {
  const { clipboard } = platform()
  return { text: clipboard.readText(), html: clipboard.readHTML() }
}

function writeSnapshot(snap: Snapshot): void {
  const { clipboard } = platform()
  if (snap.html) clipboard.write({ text: snap.text, html: snap.html })
  else if (snap.text) clipboard.writeText(snap.text)
  else clipboard.clear()
}

/**
 * Borrow the clipboard and return a function that hands it back. Used around
 * any flow that temporarily writes to the clipboard (price-check item capture,
 * regex paste, chat paste) so the user's copied content survives the round trip.
 *
 * Borrows nest. Only the first one captures, and only the last one to release
 * writes back - a naive per-caller save/restore would let an overlapping flow
 * snapshot the *other* flow's scratch value and then restore it last, leaving
 * that scratch value on the clipboard for good. That is exactly what a
 * price-check landing inside a `/itemfilter` chat paste did: the clipboard was
 * left holding the chat command (#562).
 *
 * Restore functions are idempotent and order-independent.
 */
export function snapshotClipboard(): () => void {
  if (borrowers === 0) pristine = readSnapshot()
  borrowers++

  let released = false
  const release = (): void => {
    if (released) return
    released = true
    clearTimeout(watchdog)
    borrowers--
    if (borrowers > 0) return
    if (pristine) writeSnapshot(pristine)
    pristine = null
  }
  const watchdog = setTimeout(release, BORROW_TIMEOUT_MS)
  watchdog.unref?.()
  return release
}

/** Test-only: drop any in-flight borrow state between cases. */
export function __resetClipboardBorrows(): void {
  pristine = null
  borrowers = 0
}
