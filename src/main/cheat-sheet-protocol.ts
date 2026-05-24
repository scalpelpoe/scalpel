import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { categoryDir, ensureThumb } from './cheat-sheet-storage'

const SCHEME = 'cheatsheet'

const CONTENT_TYPES: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

export function registerCheatSheetProtocol(): void {
  protocol.handle(SCHEME, async (request) => {
    const raw = request.url.replace(`${SCHEME}://`, '')
    const [pathPart, queryPart = ''] = raw.split('?')
    const [categoryId, file = ''] = pathPart.split('/')

    let filePath: string
    if (queryPart.includes('thumb=1') && file) {
      const dot = file.lastIndexOf('.')
      const sheetId = dot >= 0 ? file.slice(0, dot) : file
      const ext = dot >= 0 ? file.slice(dot + 1) : ''
      filePath = ensureThumb(categoryId, sheetId, ext)
    } else {
      filePath = join(categoryDir(categoryId), file)
    }

    const inner = await net.fetch(pathToFileURL(filePath).toString())
    return new Response(inner.body, {
      status: inner.status,
      headers: { 'content-type': contentTypeFor(filePath) },
    })
  })
}
