import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformEnv } from '../../types'

const mocks = vi.hoisted(() => ({
  nativeWayland: true,
  readWaylandText: vi.fn<() => string | null>(() => 'wayland text'),
  writeWaylandText: vi.fn(() => true),
  readWaylandHtml: vi.fn(() => 'wayland html'),
  readWaylandUriList: vi.fn(() => 'file:///tmp/item.png'),
  readWaylandImageDataUrl: vi.fn(() => 'data:image/png;base64,UE5H'),
  clearWaylandClipboard: vi.fn(() => true),
  electronReadText: vi.fn(() => 'electron text'),
  electronWriteText: vi.fn(),
  electronReadHTML: vi.fn(() => 'electron html'),
  electronWrite: vi.fn(),
  electronClear: vi.fn(),
  electronRead: vi.fn(() => 'electron format'),
  electronReadImage: vi.fn(() => ({ isEmpty: () => true, toDataURL: () => '' })),
  electronReadBuffer: vi.fn(() => Buffer.alloc(0)),
  electronAvailableFormats: vi.fn(() => []),
  clipboardBackend: 'auto' as string,
  compositorActive: false,
  compositor: {
    available: vi.fn(() => true),
    readText: vi.fn(() => 'compositor text'),
    readHTML: vi.fn(() => 'compositor html'),
    writeText: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
  },
}))

const env: PlatformEnv = {
  platform: 'linux',
  env: {},
  argv: ['electron', '--ozone-platform=wayland'],
}

vi.mock('electron', () => ({
  clipboard: {
    readText: mocks.electronReadText,
    writeText: mocks.electronWriteText,
    readHTML: mocks.electronReadHTML,
    write: mocks.electronWrite,
    clear: mocks.electronClear,
    read: mocks.electronRead,
    readImage: mocks.electronReadImage,
    readBuffer: mocks.electronReadBuffer,
    availableFormats: mocks.electronAvailableFormats,
  },
  nativeImage: {
    createFromDataURL: vi.fn((url: string) => ({ isEmpty: () => false, toDataURL: () => url })),
  },
}))
vi.mock('./display', () => ({ isNativeWayland: () => mocks.nativeWayland }))
vi.mock('./wayland/compositor-clipboard', () => ({
  availableCompositorClipboard: () => (mocks.compositorActive ? mocks.compositor : null),
}))
vi.mock('./clipboard-backend', () => ({ getLinuxClipboardBackend: () => mocks.clipboardBackend }))
vi.mock('./wayland/clipboard', () => ({
  readWaylandText: mocks.readWaylandText,
  writeWaylandText: mocks.writeWaylandText,
  readWaylandHtml: mocks.readWaylandHtml,
  readWaylandUriList: mocks.readWaylandUriList,
  readWaylandImageDataUrl: mocks.readWaylandImageDataUrl,
  clearWaylandClipboard: mocks.clearWaylandClipboard,
}))

import { createLinuxClipboard, type LinuxClipboard } from './clipboard'

let clipboard: LinuxClipboard

beforeEach(() => {
  vi.clearAllMocks()
  mocks.nativeWayland = true
  mocks.writeWaylandText.mockReturnValue(true)
  mocks.clearWaylandClipboard.mockReturnValue(true)
  mocks.readWaylandText.mockReturnValue('wayland text')
  mocks.readWaylandHtml.mockReturnValue('wayland html')
  mocks.readWaylandUriList.mockReturnValue('file:///tmp/item.png')
  mocks.readWaylandImageDataUrl.mockReturnValue('data:image/png;base64,UE5H')
  mocks.clipboardBackend = 'auto'
  mocks.compositorActive = false
  mocks.compositor.available.mockReturnValue(true)
  clipboard = createLinuxClipboard(env)
})

describe('Linux clipboard facade on native Wayland', () => {
  it('routes text operations through wl-clipboard', () => {
    expect(clipboard.readText()).toBe('wayland text')
    clipboard.writeText('hello')
    clipboard.clear()
    expect(mocks.writeWaylandText).toHaveBeenCalledWith('hello')
    expect(mocks.clearWaylandClipboard).toHaveBeenCalled()
    expect(mocks.electronReadText).not.toHaveBeenCalled()
    expect(mocks.electronWriteText).not.toHaveBeenCalled()
    expect(mocks.electronClear).not.toHaveBeenCalled()
  })

  it('prefers the compositor clipboard in auto when a host provides one', () => {
    mocks.compositorActive = true
    expect(clipboard.readTextWithSource()).toEqual({ text: 'compositor text', source: 'compositor' })
    expect(mocks.readWaylandText).not.toHaveBeenCalled()
  })

  it('uses the Wayland uri-list for URL formats', () => {
    expect(clipboard.read('text/uri-list')).toBe('file:///tmp/item.png')
    expect(clipboard.read('public.file-url')).toBe('file:///tmp/item.png')
    expect(mocks.electronRead).not.toHaveBeenCalled()
  })

  it('converts a Wayland image to a native image', () => {
    const image = clipboard.readImage()
    expect(image.isEmpty()).toBe(false)
    expect(image.toDataURL()).toBe('data:image/png;base64,UE5H')
    expect(mocks.electronReadImage).not.toHaveBeenCalled()
  })

  it('falls back to Electron when a Wayland command fails', () => {
    mocks.readWaylandText.mockReturnValue(null)
    mocks.writeWaylandText.mockReturnValue(false)

    expect(clipboard.readText()).toBe('electron text')
    clipboard.writeText('hello')
    expect(mocks.electronReadText).toHaveBeenCalled()
    expect(mocks.electronWriteText).toHaveBeenCalledWith('hello')
  })

  it('reports which clipboard backend answered for flow tracing', () => {
    expect(clipboard.readTextWithSource()).toEqual({ text: 'wayland text', source: 'wayland' })
    expect(clipboard.clearWithSource()).toBe('wayland')

    mocks.readWaylandText.mockReturnValue(null)
    mocks.clearWaylandClipboard.mockReturnValue(false)

    expect(clipboard.readTextWithSource()).toEqual({ text: 'electron text', source: 'electron' })
    expect(clipboard.clearWithSource()).toBe('electron')
    expect(mocks.electronClear).toHaveBeenCalled()
  })

  it('leaves X11/XWayland on the original Electron clipboard', () => {
    mocks.nativeWayland = false

    expect(clipboard.readText()).toBe('electron text')
    clipboard.writeText('hello')
    clipboard.clear()
    expect(clipboard.read('text/uri-list')).toBe('electron format')
    expect(mocks.readWaylandText).not.toHaveBeenCalled()
    expect(mocks.writeWaylandText).not.toHaveBeenCalled()
    expect(mocks.clearWaylandClipboard).not.toHaveBeenCalled()
    expect(mocks.readWaylandUriList).not.toHaveBeenCalled()
    expect(mocks.electronReadText).toHaveBeenCalled()
    expect(mocks.electronWriteText).toHaveBeenCalledWith('hello')
    expect(mocks.electronClear).toHaveBeenCalled()
  })
})

describe('explicit Linux clipboard backends', () => {
  it('uses the layer-shell host data-control clipboard when selected', () => {
    mocks.clipboardBackend = 'compositor'
    mocks.compositorActive = true

    expect(clipboard.readTextWithSource()).toEqual({ text: 'compositor text', source: 'compositor' })
    expect(clipboard.readHTML()).toBe('compositor html')
    clipboard.writeText('hello')
    clipboard.clear()

    expect(mocks.compositor.writeText).toHaveBeenCalledWith('hello')
    expect(mocks.compositor.clear).toHaveBeenCalled()
    expect(mocks.readWaylandText).not.toHaveBeenCalled()
    expect(mocks.electronReadText).not.toHaveBeenCalled()
  })

  it('falls back to the auto backend when no compositor clipboard is available', () => {
    mocks.clipboardBackend = 'compositor'
    mocks.compositorActive = false

    expect(clipboard.readText()).toBe('wayland text')
  })

  it('forces Electron clipboard even on native Wayland when selected', () => {
    mocks.clipboardBackend = 'native'

    expect(clipboard.readText()).toBe('electron text')
    expect(mocks.readWaylandText).not.toHaveBeenCalled()
  })

  it('ignores wl-clipboard on X11 when it was saved from a Wayland session', () => {
    mocks.clipboardBackend = 'wl-clipboard'
    mocks.nativeWayland = false

    expect(clipboard.readText()).toBe('electron text')
    expect(mocks.readWaylandText).not.toHaveBeenCalled()
  })
})
