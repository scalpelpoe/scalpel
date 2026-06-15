import type { WhiteboardElement } from '@shared/whiteboard-types'

/** The exact text we last wrote to the OS clipboard, or null if we haven't
 *  written since module load. Used by `readOsClipboardForPaste` to detect a
 *  Scalpel-internal round-trip: if the OS clipboard still matches what we
 *  wrote, the user is pasting their own selection back into the canvas and
 *  we should restore from the in-memory clipboard (which retains shapes,
 *  strokes, etc.) rather than treat the OS text as external content. */
let lastWrittenText: string | null = null

/** Reset module state for tests. Production code never calls this. */
export function __resetClipboardStateForTests(): void {
  lastWrittenText = null
}

/** Derive the plain-text representation of a Scalpel selection for the OS
 *  clipboard. Only text elements contribute content; shapes / strokes /
 *  images are intentionally omitted because there's no faithful text form
 *  for them. Order matches the in-memory clipboard, which mirrors canvas
 *  z-order. */
export function elementsToClipboardText(elements: WhiteboardElement[]): string {
  return elements
    .filter((e): e is Extract<WhiteboardElement, { type: 'text' }> => e.type === 'text')
    .map((e) => e.text)
    .join('\n')
}

/** Best-effort write of a Scalpel selection to the OS clipboard. We write
 *  only the readable plain-text form so the user can paste it cleanly into
 *  any other app. The marker-comparison trick in `readOsClipboardForPaste`
 *  is what makes round-trip-back-into-Scalpel restore full element
 *  fidelity. Caller does not await. */
export function writeElementsToOsClipboard(elements: WhiteboardElement[]): void {
  const text = elementsToClipboardText(elements)
  lastWrittenText = text
  navigator.clipboard.writeText(text).catch(() => {
    /* clipboard access denied / unfocused; in-memory clipboard still works */
  })
}

export type OsClipboardRead =
  /** OS clipboard still matches the text we last wrote. The user is pasting
   *  a Scalpel copy back in; the caller should restore from the in-memory
   *  clipboard for full element fidelity. */
  | { kind: 'internal-roundtrip' }
  /** OS clipboard has text we didn't write - paste it as a text element. */
  | { kind: 'external-text'; text: string }
  /** OS clipboard has an image. The `src` is a data URL (the MIME type is
   *  encoded in the URL prefix, so no separate field is needed). */
  | { kind: 'external-image'; src: string }
  /** OS clipboard is empty and we haven't written anything. */
  | { kind: 'empty' }
  /** Reading the OS clipboard failed (no focus, permission denied, API
   *  missing). Caller can still fall back to the in-memory clipboard. */
  | { kind: 'unavailable' }

/** Read and classify the OS clipboard for the paste flow. Image reads go
 *  through the main-process bridge (`window.api.clipboardReadImage`) so we
 *  don't need to request `clipboard-read` permission in the renderer; text
 *  reads use the renderer API since `navigator.clipboard.readText` is
 *  permitted by default in Electron. */
export async function readOsClipboardForPaste(): Promise<OsClipboardRead> {
  // Image first - if the clipboard has an image, that's almost certainly
  // what the user wants to paste.
  try {
    const img = await window.api.clipboardReadImage()
    if (img !== null) {
      return { kind: 'external-image', src: img.src }
    }
  } catch {
    /* main bridge unavailable; fall through to text */
  }
  // Text path.
  try {
    return classifyText(await navigator.clipboard.readText())
  } catch {
    return { kind: 'unavailable' }
  }
}

function classifyText(text: string): OsClipboardRead {
  if (lastWrittenText !== null && text === lastWrittenText) {
    return { kind: 'internal-roundtrip' }
  }
  if (text.length === 0) return { kind: 'empty' }
  return { kind: 'external-text', text }
}
