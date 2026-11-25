import { execFileSync } from 'node:child_process'
import { reportLinuxDiagnostic } from '../diagnostics'

/** Minimal native-Wayland clipboard access through wl-clipboard.
 *
 *  Electron's clipboard calls are synchronous, so this module keeps the same
 *  shape. It is only used when the process runs with native Wayland Ozone;
 *  callers fall back to Electron's clipboard when the tools are missing or fail.
 *  No compositor-specific CLI or state is involved. */
const COPY_TOOL = 'wl-copy'
const PASTE_TOOL = 'wl-paste'
const COMMAND_TIMEOUT_MS = 2_000
// A paste asks the current selection owner for data and can legitimately take
// longer than a version/copy probe. Two seconds tripped on slower XWayland
// game owners while the main process waited synchronously.
const READ_TIMEOUT_MS = 5_000
const MAX_TEXT_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_BYTES = 50 * 1024 * 1024

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'] as const

type CommandError = Error & { code?: number | string; status?: number | null }

let toolsAvailable: boolean | undefined

function runText(tool: string, args: string[], input?: string, timeoutMs = COMMAND_TIMEOUT_MS): string {
  return execFileSync(tool, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: MAX_TEXT_BYTES,
    stdio: ['ignore', 'pipe', 'ignore'],
    ...(input === undefined ? {} : { input }),
  })
}

/** wl-copy forks a selection owner that inherits stdio by default, which makes
 *  a synchronous child wait hang until timeout. Ignoring its output streams
 *  lets us wait only for the short-lived parent that performs the copy. */
function runWrite(tool: string, args: string[], input: string): void {
  execFileSync(tool, args, {
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_TEXT_BYTES,
    input,
    stdio: ['pipe', 'ignore', 'ignore'],
  })
}

function runBuffer(tool: string, args: string[]): Buffer {
  return execFileSync(tool, args, {
    encoding: 'buffer',
    timeout: READ_TIMEOUT_MS,
    maxBuffer: MAX_IMAGE_BYTES,
    stdio: ['ignore', 'pipe', 'ignore'],
  }) as Buffer
}

function isEmptySelection(error: unknown): boolean {
  // wl-paste exits 1 when the selection is simply empty. That is a normal
  // result, not a reason to fall back to a possibly stale Electron clipboard.
  const commandError = error as CommandError | null
  return commandError?.status === 1 || commandError?.code === 1
}

function isReadTimeout(error: unknown): boolean {
  return (error as CommandError | null)?.code === 'ETIMEDOUT'
}

function report(label: string, error: unknown): void {
  reportLinuxDiagnostic(label, error)
}

/** True when both wl-clipboard tools are installed and start successfully. */
export function hasWaylandClipboardTools(): boolean {
  if (toolsAvailable !== undefined) return toolsAvailable
  toolsAvailable = false
  try {
    runText(COPY_TOOL, ['--version'])
    runText(PASTE_TOOL, ['--version'])
    toolsAvailable = true
  } catch {
    // Missing tools: callers silently use Electron's clipboard instead.
  }
  return toolsAvailable
}

function readMime(mime?: string): string | null {
  if (!hasWaylandClipboardTools()) return null
  const args = ['--no-newline']
  if (mime) args.push('--type', mime)
  try {
    return runText(PASTE_TOOL, args, undefined, READ_TIMEOUT_MS)
  } catch (error) {
    if (isEmptySelection(error)) return ''
    if (isReadTimeout(error)) {
      // The selection owner never answered. Electron's clipboard still holds
      // XWayland-era data, so falling back to it would risk pricing a stale
      // item. Report the timeout and treat the selection as empty instead.
      report('wayland-clipboard:read-timeout', error)
      return ''
    }
    report('wayland-clipboard:read', error)
    return null
  }
}

/** Read plain text. Returns null only when wl-clipboard itself is unusable. */
export function readWaylandText(): string | null {
  return readMime()
}

/** Read HTML when another client offers it. */
export function readWaylandHtml(): string | null {
  return readMime('text/html')
}

/** Read a text/uri-list payload (file and http(s) URLs). */
export function readWaylandUriList(): string | null {
  return readMime('text/uri-list')
}

/** Put text on the Wayland selection. Returns false when the write failed. */
export function writeWaylandText(text: string): boolean {
  if (!hasWaylandClipboardTools()) return false
  try {
    runWrite(COPY_TOOL, [], text)
    return true
  } catch (error) {
    report('wayland-clipboard:write', error)
    return false
  }
}

/** Clear the Wayland selection. */
export function clearWaylandClipboard(): boolean {
  if (!hasWaylandClipboardTools()) return false
  try {
    runText(COPY_TOOL, ['--clear'])
    return true
  } catch (error) {
    report('wayland-clipboard:clear', error)
    return false
  }
}

/** Read the first supported image type as a data URL, or null when there is no
 *  image on the selection. Kept separate from text so callers can try their
 *  existing file/URL fallbacks when no image is offered. */
export function readWaylandImageDataUrl(): string | null {
  if (!hasWaylandClipboardTools()) return null

  let types: string[]
  try {
    types = runText(PASTE_TOOL, ['--list-types'])
      .split(/\r?\n/)
      .map((type) => type.trim())
      .filter(Boolean)
  } catch (error) {
    if (!isEmptySelection(error)) {
      report(isReadTimeout(error) ? 'wayland-clipboard:list-types-timeout' : 'wayland-clipboard:list-types', error)
    }
    return null
  }

  const mime = IMAGE_TYPES.find((type) => types.includes(type))
  if (!mime) return null

  try {
    const data = runBuffer(PASTE_TOOL, ['--no-newline', '--type', mime])
    if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return null
    return `data:${mime};base64,${data.toString('base64')}`
  } catch (error) {
    if (!isEmptySelection(error)) {
      report(isReadTimeout(error) ? 'wayland-clipboard:read-image-timeout' : 'wayland-clipboard:read-image', error)
    }
    return null
  }
}

/** @internal Exported so tests can clear the tool-availability cache. */
export function __resetWaylandClipboardCache(): void {
  toolsAvailable = undefined
}
