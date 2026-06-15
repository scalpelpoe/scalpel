// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { StrokeElement, TextElement, WhiteboardElement } from '@shared/whiteboard-types'
import {
  __resetClipboardStateForTests,
  elementsToClipboardText,
  readOsClipboardForPaste,
  writeElementsToOsClipboard,
} from './os-clipboard'

const stroke = (id: string): StrokeElement => ({
  id,
  z: 0,
  rotation: 0,
  type: 'stroke',
  variant: 'pen',
  points: [{ x: 0.1, y: 0.1 }],
  color: '#ff0000',
  width: 0.005,
})

const text = (id: string, body: string): TextElement => ({
  id,
  z: 0,
  rotation: 0,
  type: 'text',
  bbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.03 },
  text: body,
  color: '#ffffff',
  fontSize: 0.025,
  fontWeight: 600,
})

let clipText = ''
let readShouldThrow = false
let nextImage: { src: string } | null = null

beforeEach(() => {
  clipText = ''
  readShouldThrow = false
  nextImage = null
  __resetClipboardStateForTests()
  vi.stubGlobal('navigator', {
    clipboard: {
      readText: async (): Promise<string> => {
        if (readShouldThrow) throw new Error('denied')
        return clipText
      },
      writeText: async (s: string): Promise<void> => {
        clipText = s
      },
    },
  })
  // Stub the preload bridge that the image-read path goes through.
  vi.stubGlobal('window', {
    ...globalThis.window,
    api: {
      clipboardReadImage: async (): Promise<{ src: string } | null> => nextImage,
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('elementsToClipboardText', () => {
  it('joins text element bodies with newlines', () => {
    expect(elementsToClipboardText([text('a', 'one'), text('b', 'two')])).toBe('one\ntwo')
  })

  it('skips non-text elements', () => {
    const mixed: WhiteboardElement[] = [text('a', 'hi'), stroke('s'), text('b', 'there')]
    expect(elementsToClipboardText(mixed)).toBe('hi\nthere')
  })

  it('returns empty string when there are no text elements', () => {
    expect(elementsToClipboardText([stroke('s')])).toBe('')
  })
})

describe('writeElementsToOsClipboard / readOsClipboardForPaste', () => {
  it('writes only readable text to the OS clipboard (no JSON marker)', async () => {
    writeElementsToOsClipboard([text('a', 'a shape'), text('b', 'Text on screen')])
    await Promise.resolve()
    expect(clipText).toBe('a shape\nText on screen')
  })

  it('classifies a round-trip of our own write as internal-roundtrip', async () => {
    writeElementsToOsClipboard([text('a', 'hello')])
    await Promise.resolve()
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'internal-roundtrip' })
  })

  it('classifies foreign text as external-text', async () => {
    clipText = 'pasted from somewhere else'
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'external-text', text: 'pasted from somewhere else' })
  })

  it('treats a foreign edit of the clipboard as external even when text differs slightly', async () => {
    writeElementsToOsClipboard([text('a', 'hello')])
    await Promise.resolve()
    clipText = 'hello world'
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'external-text', text: 'hello world' })
  })

  it('classifies an empty clipboard as empty when we have not written', async () => {
    clipText = ''
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'empty' })
  })

  it('classifies an empty clipboard as internal-roundtrip after a shapes-only copy', async () => {
    writeElementsToOsClipboard([stroke('s')])
    await Promise.resolve()
    expect(clipText).toBe('')
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'internal-roundtrip' })
  })

  it('returns unavailable when readText throws', async () => {
    readShouldThrow = true
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'unavailable' })
  })
})

describe('readOsClipboardForPaste image branch', () => {
  it('returns external-image when the main bridge surfaces an image', async () => {
    nextImage = { src: 'data:image/png;base64,iVBORw0K' }
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'external-image', src: 'data:image/png;base64,iVBORw0K' })
  })

  it('prefers image over text when both are present on the clipboard', async () => {
    nextImage = { src: 'data:image/png;base64,iVBORw0K' }
    clipText = 'caption that should be ignored'
    const read = await readOsClipboardForPaste()
    expect(read.kind).toBe('external-image')
  })

  it('falls back to text when no image is on the clipboard', async () => {
    nextImage = null
    clipText = 'from another app'
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'external-text', text: 'from another app' })
  })

  it('falls back to text path when the main bridge throws', async () => {
    vi.stubGlobal('window', {
      ...globalThis.window,
      api: {
        clipboardReadImage: async (): Promise<never> => {
          throw new Error('bridge unavailable')
        },
      },
    })
    clipText = 'plain text fallback'
    const read = await readOsClipboardForPaste()
    expect(read).toEqual({ kind: 'external-text', text: 'plain text fallback' })
  })
})
