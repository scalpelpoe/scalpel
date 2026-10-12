import type { BrowserWindow } from 'electron'

/** Linux has move/resize events but no moved/resized completion events. */
export function trackLinuxBounds(win: BrowserWindow, isProgrammatic: () => boolean, persist: () => void): void {
  let pending: ReturnType<typeof setTimeout> | null = null
  const cancel = (): void => {
    if (pending) clearTimeout(pending)
    pending = null
  }
  const flush = (): void => {
    if (!pending) return
    cancel()
    if (!win.isDestroyed() && !isProgrammatic()) persist()
  }
  const changed = (): void => {
    if (isProgrammatic()) return
    cancel()
    pending = setTimeout(flush, 150)
  }
  win.on('move', changed)
  win.on('resize', changed)
  // Save before unmapping, even when focus leaves immediately after a drag.
  win.on('hide', flush)
  win.on('closed', cancel)
}
