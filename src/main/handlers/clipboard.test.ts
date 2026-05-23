import { closeSync, ftruncateSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock electron before importing the module under test so the ipcMain.handle
// call at register-time finds a stub instead of crashing.
vi.mock('electron', () => ({
  clipboard: {
    readImage: vi.fn(() => ({ isEmpty: () => true, toDataURL: () => '' })),
    availableFormats: vi.fn(() => []),
    read: vi.fn(() => ''),
  },
  ipcMain: { handle: vi.fn() },
}))

import { __fetchHttpImage, __parseCfHdrop, __readImageFromFilePathForTests } from './clipboard'

let tmp: string

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'wb-clip-'))
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('readImageFromFilePath', () => {
  it('encodes a PNG file as a data URL with the right MIME', () => {
    // Minimal PNG header bytes; we don't need a fully-valid PNG to test
    // the encode path, just something with bytes and the right extension.
    const path = join(tmp, 'pic.png')
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))
    const result = __readImageFromFilePathForTests(path)
    expect(result?.src.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('detects JPEG from .jpg and .jpeg extensions', () => {
    for (const ext of ['.jpg', '.jpeg']) {
      const path = join(tmp, `pic${ext}`)
      writeFileSync(path, Buffer.from([0xff, 0xd8, 0xff]))
      const result = __readImageFromFilePathForTests(path)
      expect(result?.src.startsWith('data:image/jpeg;base64,')).toBe(true)
    }
  })

  it('rejects non-image extensions', () => {
    const path = join(tmp, 'doc.txt')
    writeFileSync(path, 'hello')
    expect(__readImageFromFilePathForTests(path)).toBeNull()
  })

  it('rejects files that exceed the size limit', () => {
    // 51 MB exceeds the 50 MB cap. Use a sparse file (ftruncate) instead of
    // allocating + writing 51 MB - the size check uses statSync and short-
    // circuits before readFileSync, and a real 51 MB write blew the default
    // 5s vitest timeout on slow CI disks.
    const path = join(tmp, 'huge.png')
    const fd = openSync(path, 'w')
    ftruncateSync(fd, 51 * 1024 * 1024)
    closeSync(fd)
    expect(__readImageFromFilePathForTests(path)).toBeNull()
  })

  it('returns null when the file does not exist', () => {
    expect(__readImageFromFilePathForTests(join(tmp, 'does-not-exist.png'))).toBeNull()
  })

  it('is case-insensitive on the extension', () => {
    const path = join(tmp, 'PIC.PNG')
    writeFileSync(path, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const result = __readImageFromFilePathForTests(path)
    expect(result?.src.startsWith('data:image/png;base64,')).toBe(true)
  })
})

describe('parseCfHdrop', () => {
  function buildCfHdrop(paths: string[], wide: boolean): Buffer {
    // 20-byte DROPFILES header: pFiles(4) + pt(8) + fNC(4) + fWide(4).
    const header = Buffer.alloc(20)
    header.writeUInt32LE(20, 0) // pFiles = start of list immediately after header
    header.writeUInt32LE(wide ? 1 : 0, 16)
    let listBuf: Buffer
    if (wide) {
      // Each path as UTF-16LE + null terminator, plus a final null at the end.
      const parts: Buffer[] = []
      for (const p of paths) {
        parts.push(Buffer.from(p, 'utf16le'))
        parts.push(Buffer.from([0, 0]))
      }
      parts.push(Buffer.from([0, 0]))
      listBuf = Buffer.concat(parts)
    } else {
      const parts: Buffer[] = []
      for (const p of paths) {
        parts.push(Buffer.from(p, 'utf8'))
        parts.push(Buffer.from([0]))
      }
      parts.push(Buffer.from([0]))
      listBuf = Buffer.concat(parts)
    }
    return Buffer.concat([header, listBuf])
  }

  it('decodes a single wide-char path from CF_HDROP', () => {
    const buf = buildCfHdrop(['C:\\Users\\test\\image.png'], true)
    expect(__parseCfHdrop(buf)).toEqual(['C:\\Users\\test\\image.png'])
  })

  it('decodes multiple wide-char paths from CF_HDROP', () => {
    const buf = buildCfHdrop(['C:\\a.png', 'C:\\b.jpg'], true)
    expect(__parseCfHdrop(buf)).toEqual(['C:\\a.png', 'C:\\b.jpg'])
  })

  it('decodes ANSI paths from a non-wide CF_HDROP buffer', () => {
    const buf = buildCfHdrop(['C:\\old.png'], false)
    expect(__parseCfHdrop(buf)).toEqual(['C:\\old.png'])
  })

  it('returns empty for a too-short buffer', () => {
    expect(__parseCfHdrop(Buffer.alloc(8))).toEqual([])
  })
})

describe('fetchHttpImage', () => {
  function stubFetch(impl: (url: string) => Response | Promise<Response>): void {
    vi.stubGlobal('fetch', vi.fn(impl))
  }
  function imageResponse(mime: string, body: Uint8Array, contentLength?: number): Response {
    const headers = new Headers({ 'content-type': mime })
    if (contentLength !== undefined) headers.set('content-length', String(contentLength))
    return new Response(body as BodyInit, { status: 200, headers })
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('inlines a PNG fetched over https', async () => {
    stubFetch(() => imageResponse('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])))
    const result = await __fetchHttpImage('https://example.com/x.png')
    expect(result?.src.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('rejects non-http(s) URLs', async () => {
    stubFetch(() => imageResponse('image/png', new Uint8Array([0])))
    expect(await __fetchHttpImage('ftp://example.com/x.png')).toBeNull()
    expect(await __fetchHttpImage('data:image/png;base64,abc')).toBeNull()
    expect(await __fetchHttpImage('file:///etc/passwd')).toBeNull()
  })

  it('rejects non-image content types', async () => {
    stubFetch(() => new Response('not an image', { status: 200, headers: { 'content-type': 'text/html' } }))
    expect(await __fetchHttpImage('https://example.com/x')).toBeNull()
  })

  it('rejects SVG (script-execution surface)', async () => {
    stubFetch(() => imageResponse('image/svg+xml', new Uint8Array([0x3c, 0x73, 0x76, 0x67])))
    expect(await __fetchHttpImage('https://example.com/x.svg')).toBeNull()
  })

  it('rejects when content-length declares > size cap', async () => {
    stubFetch(() => imageResponse('image/png', new Uint8Array([0x89]), 100 * 1024 * 1024))
    expect(await __fetchHttpImage('https://example.com/big.png')).toBeNull()
  })

  it('rejects non-2xx responses', async () => {
    stubFetch(() => new Response('not found', { status: 404 }))
    expect(await __fetchHttpImage('https://example.com/missing.png')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    stubFetch(() => {
      throw new Error('network down')
    })
    expect(await __fetchHttpImage('https://example.com/x.png')).toBeNull()
  })
})
