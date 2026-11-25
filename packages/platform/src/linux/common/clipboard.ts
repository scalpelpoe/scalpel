import { clipboard as electronClipboard, nativeImage, type NativeImage } from 'electron'
import { reportBreadcrumb } from '../../common/diagnostics'
import { currentEnv } from '../../select'
import type { Clipboard, PlatformEnv } from '../../types'
import { getLinuxClipboardBackend } from './clipboard-backend'
import { isNativeWayland } from './display'
import { nativeOverlayServices } from './native-overlay'
import { availableCompositorClipboard } from './wayland/compositor-clipboard'
import {
  clearWaylandClipboard,
  readWaylandHtml,
  readWaylandImageDataUrl,
  readWaylandText,
  readWaylandUriList,
  writeWaylandText,
} from './wayland/clipboard'

/** Which clipboard answered a read. Flow tracing uses this to prove where an
 *  item came from on native Wayland. */
export type LinuxClipboardSource = 'wayland' | 'compositor' | 'electron'

export interface LinuxClipboard extends Clipboard {
  readTextWithSource(): { text: string; source: LinuxClipboardSource }
  clearWithSource(): LinuxClipboardSource
  availableFormats(): string[]
}

/** Three implementations exist: Electron's clipboard, wl-clipboard, and the
 *  data-control clipboard of a layer-shell host. `auto` prefers the compositor
 *  clipboard when a host provides one, then falls back to wl-clipboard on
 *  native Wayland and Electron everywhere else. */
export function linuxCompositorClipboardAvailable(): boolean {
  return availableCompositorClipboard() !== null || Boolean(nativeOverlayServices()?.clipboard?.available())
}

let lastResolvedClipboard: string | null = null

/** One debug line whenever the clipboard actually changes source. */
function logResolvedClipboard(source: LinuxClipboardSource, compositorAvailable: boolean): void {
  const preference = getLinuxClipboardBackend()
  const key = `${source}|${preference}|${compositorAvailable}`
  if (lastResolvedClipboard === key) return
  lastResolvedClipboard = key
  reportBreadcrumb(
    `[linux/clipboard] resolved=${source} preference=${preference} compositorAvailable=${compositorAvailable}`,
    'debug',
  )
}

export function createLinuxClipboard(env: PlatformEnv = currentEnv()): LinuxClipboard {
  const compositor = () => {
    const backend = getLinuxClipboardBackend()
    if (backend !== 'auto' && backend !== 'compositor') return null
    const registered = availableCompositorClipboard()
    if (registered) return registered
    const overlay = nativeOverlayServices()?.clipboard
    return overlay?.available() ? overlay : null
  }
  // `native` is the only explicit opt-out. A compositor clipboard takes priority
  // when a layer-shell host is active; wl-clipboard is its Wayland fallback.
  const useWayland = () =>
    getLinuxClipboardBackend() !== 'native' && env.platform === 'linux' && isNativeWayland(env.argv)

  function readTextWithSource(): { text: string; source: LinuxClipboardSource } {
    const host = compositor()
    if (host) {
      logResolvedClipboard('compositor', true)
      return { text: host.readText(), source: 'compositor' }
    }
    if (useWayland()) {
      const text = readWaylandText()
      if (text !== null) {
        logResolvedClipboard('wayland', false)
        return { text, source: 'wayland' }
      }
    }
    logResolvedClipboard('electron', false)
    return { text: electronClipboard.readText(), source: 'electron' }
  }

  function clearWithSource(): LinuxClipboardSource {
    const host = compositor()
    if (host) {
      host.clear()
      logResolvedClipboard('compositor', true)
      return 'compositor'
    }
    if (useWayland() && clearWaylandClipboard()) {
      logResolvedClipboard('wayland', false)
      return 'wayland'
    }
    electronClipboard.clear()
    logResolvedClipboard('electron', false)
    return 'electron'
  }

  const clipboard: LinuxClipboard = {
    readText: () => readTextWithSource().text,
    readTextWithSource,
    writeText(text) {
      const host = compositor()
      if (host) {
        host.writeText(text)
        return
      }
      if (useWayland() && writeWaylandText(text)) return
      electronClipboard.writeText(text)
    },
    readHTML() {
      const host = compositor()
      if (host) return host.readHTML()
      if (useWayland()) {
        const html = readWaylandHtml()
        if (html !== null) return html
      }
      return electronClipboard.readHTML()
    },
    write(data) {
      const host = compositor()
      if (host) {
        host.write(data)
        return
      }
      // wl-copy serves one MIME type per selection. Text is the format Scalpel's
      // own flows round-trip; HTML-only payloads keep Electron's original path.
      if (useWayland() && data.text !== undefined && writeWaylandText(data.text)) return
      electronClipboard.write(data)
    },
    clear: () => clearWithSource(),
    clearWithSource,
    read(format) {
      if (useWayland() && (format === 'text/uri-list' || format === 'public.file-url')) {
        const urls = readWaylandUriList()
        if (urls !== null) return urls
      }
      return electronClipboard.read(format)
    },
    readImage(): NativeImage {
      if (useWayland()) {
        const dataUrl = readWaylandImageDataUrl()
        if (dataUrl) return nativeImage.createFromDataURL(dataUrl)
      }
      return electronClipboard.readImage()
    },
    readBuffer: (format) => electronClipboard.readBuffer(format),
    availableFormats: () => electronClipboard.availableFormats(),
  }
  return clipboard
}
