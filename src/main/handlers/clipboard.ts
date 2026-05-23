import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clipboard, ipcMain } from 'electron'

/** Cap on the size of a file we'll inline as a data URL on paste. Larger
 *  images bloat the BoardLibrary JSON and grind the renderer. The user can
 *  still resize the canvas's view of an image, but the inlined source
 *  bitmap is bounded. */
const MAX_IMAGE_FILE_BYTES = 50 * 1024 * 1024

/** Map file extension -> MIME type. Limited to raster formats; SVG is left
 *  out on purpose because SVG can carry script and external references. */
const IMAGE_EXTENSIONS_TO_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
}

/** Text-based clipboard formats that carry URLs. macOS uses the UTI
 *  `public.file-url` (file:// only); Linux and most browsers use the W3C
 *  `text/uri-list` which can hold file or http(s) URLs. */
const URL_FORMATS = ['public.file-url', 'text/uri-list']

/** Image MIME types we accept from a fetched HTTP(S) image. SVG is excluded
 *  intentionally - it can carry script and external references. */
const HTTP_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'])

/** Decode a Windows CF_HDROP clipboard buffer to a list of file paths.
 *  Layout: `DROPFILES` struct (20 bytes) followed by a list of strings,
 *  each null-terminated, double-null terminator at the end. `fWide` (offset
 *  16) selects UTF-16LE vs ANSI strings; modern Windows is always wide. */
export function __parseCfHdrop(buf: Buffer): string[] {
  if (buf.length < 20) return []
  const pFiles = buf.readUInt32LE(0)
  const fWide = buf.readUInt32LE(16) !== 0
  if (pFiles >= buf.length) return []
  const list = buf.subarray(pFiles)
  const paths: string[] = []
  if (fWide) {
    let i = 0
    while (i + 1 < list.length) {
      let end = i
      while (end + 1 < list.length && list.readUInt16LE(end) !== 0) end += 2
      if (end === i) break // empty entry = double-null terminator
      paths.push(list.subarray(i, end).toString('utf16le'))
      i = end + 2
    }
  } else {
    let i = 0
    while (i < list.length) {
      const nullIdx = list.indexOf(0, i)
      if (nullIdx === -1 || nullIdx === i) break
      paths.push(list.subarray(i, nullIdx).toString('utf8'))
      i = nullIdx + 1
    }
  }
  return paths
}

/** Read every URL-shaped string currently on the clipboard via the text-based
 *  URL formats. Doesn't try to interpret them - just splits per the
 *  text/uri-list spec. Lets downstream callers pick file:// vs http(s):/
 *  paths. */
function readClipboardUrls(): string[] {
  for (const fmt of URL_FORMATS) {
    let raw = ''
    try {
      raw = clipboard.read(fmt)
    } catch {
      /* unsupported format on this platform; skip */
    }
    if (!raw) continue
    const urls = raw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('#'))
    if (urls.length > 0) return urls
  }
  return []
}

/** Try several Windows clipboard format names that carry file paths.
 *  Electron's `availableFormats()` translates these into a single
 *  `text/uri-list` entry, but `clipboard.read('text/uri-list')` doesn't
 *  always perform the reverse translation - so we read the native format
 *  buffer directly and decode. */
function readWindowsFilePathBuffers(): string[] {
  if (process.platform !== 'win32') return []
  const paths: string[] = []
  const readBuf = (fmt: string): Buffer => {
    try {
      return clipboard.readBuffer(fmt)
    } catch {
      return Buffer.alloc(0)
    }
  }
  // CF_HDROP: DROPFILES header + list of strings, used by Explorer for
  // multi-file selection copies.
  const hdrop = readBuf('CF_HDROP')
  if (hdrop.length > 0) paths.push(...__parseCfHdrop(hdrop))
  if (paths.length > 0) return paths
  // FileNameW: UTF-16LE single-path format. Some apps and shell extensions
  // set this instead of (or alongside) CF_HDROP.
  const wide = readBuf('FileNameW')
  if (wide.length > 0) {
    const p = wide.toString('utf16le').replace(/\0+$/, '')
    if (p) paths.push(p)
  }
  if (paths.length > 0) return paths
  // FileName: legacy ANSI single-path format.
  const ansi = readBuf('FileName')
  if (ansi.length > 0) {
    const p = ansi.toString('utf8').replace(/\0+$/, '')
    if (p) paths.push(p)
  }
  return paths
}

/** Extract local file paths from the clipboard. Combines `file://` URLs
 *  (text/uri-list, public.file-url) with Windows-native binary formats. */
function readClipboardFilePaths(): string[] {
  const paths: string[] = []
  for (const url of readClipboardUrls()) {
    try {
      paths.push(fileURLToPath(url))
    } catch {
      /* not a file:// URL; skip */
    }
  }
  paths.push(...readWindowsFilePathBuffers())
  return paths
}

/** Exposed for tests; the main path uses it via `readClipboardFilePaths`. */
export function __readImageFromFilePathForTests(path: string): { src: string } | null {
  return readImageFromFilePath(path)
}

function readImageFromFilePath(path: string): { src: string } | null {
  const ext = extname(path).toLowerCase()
  const mime = IMAGE_EXTENSIONS_TO_MIME[ext]
  if (!mime) return null
  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(path)
  } catch {
    return null
  }
  if (!stat.isFile()) return null
  if (stat.size > MAX_IMAGE_FILE_BYTES) return null
  let buf: Buffer
  try {
    buf = readFileSync(path)
  } catch {
    return null
  }
  return { src: `data:${mime};base64,${buf.toString('base64')}` }
}

/** Fetch an http(s) image URL and inline it as a data URL. Used when the
 *  user pastes a "Copy image address" / "Copy image link" payload from a
 *  browser. Restricts to known raster MIME types and the same size cap as
 *  local file reads. */
export async function __fetchHttpImage(url: string): Promise<{ src: string } | null> {
  if (!/^https?:\/\//i.test(url)) return null
  let res: Response
  try {
    res = await fetch(url, { redirect: 'follow' })
  } catch {
    return null
  }
  if (!res.ok) return null
  const ct = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!HTTP_IMAGE_MIMES.has(ct)) return null
  const declared = res.headers.get('content-length')
  if (declared && Number(declared) > MAX_IMAGE_FILE_BYTES) return null
  let buf: Buffer
  try {
    buf = Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
  if (buf.length > MAX_IMAGE_FILE_BYTES) return null
  return { src: `data:${ct};base64,${buf.toString('base64')}` }
}

/** Read the system clipboard's image content via Electron's main-process API,
 *  which is permission-free (unlike `navigator.clipboard.read()` in the
 *  renderer, which requires a `clipboard-read` permission grant that Scalpel
 *  doesn't currently issue).
 *
 *  Three sources are checked in order:
 *    1. In-memory image bitmap (Snipping Tool, "Copy image" from a browser,
 *       Preview, screenshots). Normalized to a PNG data URL.
 *    2. File reference on the clipboard (Explorer / Finder copy of an image
 *       file). The file is read from disk and inlined as a data URL.
 *    3. HTTP(S) URL on the clipboard ("Copy image address" / "Copy image
 *       link" from a browser). The URL is fetched and inlined.
 *
 *  Returns null when no source yields an image. */
export async function __readClipboardImage(): Promise<{ src: string } | null> {
  const native = clipboard.readImage()
  if (!native.isEmpty()) {
    return { src: native.toDataURL() }
  }
  const urls = readClipboardUrls()
  const filePaths = readClipboardFilePaths()
  for (const path of filePaths) {
    const fromFile = readImageFromFilePath(path)
    if (fromFile) return fromFile
  }
  for (const url of urls) {
    const fromHttp = await __fetchHttpImage(url)
    if (fromHttp) return fromHttp
  }
  return null
}

export function register(): void {
  ipcMain.handle('clipboard:read-image', () => __readClipboardImage())
}
