/** Pure storage + image-protocol helpers for cheat sheets. Kept separate from
 *  cheat-sheets.ts (which registers a window with the secondary-overlay system)
 *  so the unit test can exercise these without dragging in BrowserWindow,
 *  ipcMain, or the rest of the main-process module graph. */

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage } from 'electron'

function rootDir(): string {
  return join(app.getPath('userData'), 'cheat-sheets')
}

export function categoryDir(categoryId: string): string {
  return join(rootDir(), categoryId)
}

export function sheetFilePath(categoryId: string, sheetId: string, ext: string): string {
  return join(categoryDir(categoryId), `${sheetId}.${ext}`)
}

export function thumbFilePath(categoryId: string, sheetId: string): string {
  return join(categoryDir(categoryId), `${sheetId}.thumb.jpg`)
}

export function generateSheetId(): string {
  return randomBytes(6).toString('hex')
}

export function generateCategoryId(): string {
  return `cat-${randomBytes(4).toString('hex')}`
}

export function saveSheetBuffer(categoryId: string, sheetId: string, ext: string, data: Buffer): string {
  const dir = categoryDir(categoryId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const path = sheetFilePath(categoryId, sheetId, ext)
  writeFileSync(path, data)
  return path
}

export function removeSheetFile(categoryId: string, sheetId: string, ext: string): void {
  const path = sheetFilePath(categoryId, sheetId, ext)
  if (existsSync(path)) unlinkSync(path)
  const thumb = thumbFilePath(categoryId, sheetId)
  if (existsSync(thumb)) unlinkSync(thumb)
}

export function removeCategoryDir(categoryId: string): void {
  const dir = categoryDir(categoryId)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

/** Bound for the longest dimension of the cached thumbnail. Big enough to stay
 *  crisp at the largest tile size we render (overlay grid: 150x100) on a 2x DPI
 *  display, small enough to keep encode time + disk usage trivial. */
const THUMB_MAX_DIM = 360

/** Returns the path to a downscaled JPEG suitable for tile rendering. Lazily
 *  generates and caches alongside the original on first request. Falls back to
 *  the original when it's already small enough or anything goes wrong (so the
 *  protocol handler can always serve something). */
export function ensureThumb(categoryId: string, sheetId: string, ext: string): string {
  const orig = sheetFilePath(categoryId, sheetId, ext)
  if (!existsSync(orig)) return orig
  const thumb = thumbFilePath(categoryId, sheetId)
  if (existsSync(thumb)) return thumb
  try {
    const img = nativeImage.createFromPath(orig)
    if (img.isEmpty()) return orig
    const size = img.getSize()
    if (size.width <= THUMB_MAX_DIM && size.height <= THUMB_MAX_DIM) return orig
    const ratio = Math.min(THUMB_MAX_DIM / size.width, THUMB_MAX_DIM / size.height)
    const resized = img.resize({
      width: Math.round(size.width * ratio),
      height: Math.round(size.height * ratio),
      quality: 'best',
    })
    writeFileSync(thumb, resized.toJPEG(88))
    return thumb
  } catch {
    return orig
  }
}

const ALLOWED_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

export async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; ext: string }> {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;]+);base64,(.+)$/)
    if (!m) throw new Error("That isn't a valid image URL")
    const mime = m[1].toLowerCase()
    const ext = ALLOWED_EXT_BY_MIME[mime]
    if (!ext) throw new Error("That isn't an image, silly")
    const buffer = Buffer.from(m[2], 'base64')
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('That image is too big (10MB max)')
    return { buffer, ext }
  }
  // Validate up front so the unfriendly fetch error ("Failed to parse URL
  // from ...") doesn't leak. Catches missing scheme ("google.com"), pasted
  // random text, etc. Rejects anything that isn't http(s).
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("That isn't a valid URL")
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error("That isn't a valid URL")
  }
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': 'Scalpel-CheatSheet' } })
  } catch {
    // Network error, DNS failure, refused connection, etc.
    throw new Error("Couldn't reach that URL")
  }
  if (!res.ok)
    throw new Error(res.status === 404 ? "Couldn't find that image (404)" : `Server error (HTTP ${res.status})`)
  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const ext = ALLOWED_EXT_BY_MIME[mime]
  if (!ext) throw new Error("That isn't an image, silly")
  const arr = await res.arrayBuffer()
  if (arr.byteLength > MAX_IMAGE_BYTES) throw new Error('That image is too big (10MB max)')
  return { buffer: Buffer.from(arr), ext }
}
