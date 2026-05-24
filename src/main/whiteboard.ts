import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { type BoardLibrary, emptyBoardLibrary, migrateBoardLibrary } from '../shared/whiteboard-types'
import { registerSecondaryOverlay, type SecondaryOverlay } from './windowing'

let userDataDirOverride: string | null = null

/** Test hook: forces the user-data dir, bypassing electron's app.getPath.
 *  Also pre-creates the whiteboard subdir so tests can seed files before
 *  calling loadLibrary. Pass null to reset after a test. */
export function __setUserDataDirForTests(dir: string | null): void {
  userDataDirOverride = dir
  if (dir !== null) {
    const wbDir = join(dir, 'whiteboard')
    if (!existsSync(wbDir)) mkdirSync(wbDir, { recursive: true })
  }
}

function userDataDir(): string {
  if (userDataDirOverride) return userDataDirOverride
  return app.getPath('userData')
}

function whiteboardDir(): string {
  const dir = join(userDataDir(), 'whiteboard')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function fileFor(version: 1 | 2): string {
  return join(whiteboardDir(), `poe${version}.json`)
}

/** Load the library file if present, parsing and validating it. Returns null
 *  if the file is missing. A present-but-corrupt file is quarantined and null
 *  is returned. Use this for ops that only make sense against an existing
 *  library (delete/rename snapshot). */
export function loadExistingLibrary(version: 1 | 2): BoardLibrary | null {
  const path = fileFor(version)
  if (!existsSync(path)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    quarantine(path)
    return null
  }
  const migrated = migrateBoardLibrary(parsed)
  if (!migrated) {
    quarantine(path)
    return null
  }
  return migrated
}

/** Load the library, falling back to a fresh empty one (sized to `gameSize`)
 *  if the file is missing or corrupt. Use this for the initial open path
 *  where a missing file is expected. */
export function loadLibrary(version: 1 | 2, gameSize: { w: number; h: number }): BoardLibrary {
  return loadExistingLibrary(version) ?? emptyBoardLibrary(gameSize)
}

export function saveLibrary(version: 1 | 2, lib: BoardLibrary): void {
  const path = fileFor(version)
  const tmp = `${path}.${process.hrtime.bigint().toString(36)}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(lib), 'utf-8')
    renameSync(tmp, path)
  } catch (err) {
    try {
      if (existsSync(tmp)) renameSync(tmp, `${tmp}.failed-${Date.now()}`)
    } catch {
      // best effort
    }
    throw err
  }
}

function quarantine(path: string): void {
  try {
    renameSync(path, `${path}.broken-${process.hrtime.bigint().toString(36)}`)
  } catch (err) {
    console.error('[whiteboard] quarantine failed', err)
  }
}

// ---- Overlay registration ---------------------------------------------------

let overlay: SecondaryOverlay | null = null

export function registerWhiteboardOverlay(): SecondaryOverlay {
  if (overlay) return overlay
  overlay = registerSecondaryOverlay({
    id: 'whiteboard',
    htmlEntry: 'whiteboard.html',
    defaultAnchor: () => ({ fracX: 0, fracY: 0, fracW: 1, fracH: 1 }),
    onFirstShow: (win) => {
      // The very first show is the user opening the whiteboard via hotkey
      // (window is created lazily on first toggle). Fire the same shown IPC
      // toggleWhiteboard uses for subsequent toggles so the renderer can
      // play its entrance animation. setImmediate delays past the initial
      // React commit so the renderer's onShown handler is already wired.
      setImmediate(() => {
        if (!win.isDestroyed()) win.webContents.send('whiteboard:shown')
      })
    },
  })
  return overlay
}

export function getWhiteboardOverlay(): SecondaryOverlay | null {
  return overlay
}

export function toggleWhiteboard(): void {
  if (!overlay) return
  const wasVisible = overlay.isVisible()
  overlay.toggle()
  const nowVisible = overlay.isVisible()
  // For the very first toggle the window is being lazily created; isVisible()
  // is false both before and after this call, and onFirstShow (registered
  // above) sends the shown IPC. For subsequent toggles the window already
  // exists and toggle()'s show/hide paths are synchronous, so we send the
  // matching IPC here. Going through the explicit toggle path means PoE-blur
  // auto-restore - which also fires win.on('show') - doesn't replay the
  // animation.
  if (!wasVisible && nowVisible) {
    overlay.send('whiteboard:shown')
  } else if (wasVisible && !nowVisible) {
    overlay.send('whiteboard:hidden')
  }
}

/** Tracked here so we can re-apply the click-through state after the
 *  secondary-overlay show/hide cycle (PoE blur+refocus). The windowing layer's
 *  installOpacityHideShow forces setIgnoreMouseEvents(false) on every show,
 *  which would otherwise drop us out of Play mode after one in-game action. */
let currentMode: 'edit' | 'play' = 'edit'
let modeHookInstalled = false

function applyMode(): void {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  if (currentMode === 'play') {
    win.setIgnoreMouseEvents(true, { forward: true })
  } else {
    win.setIgnoreMouseEvents(false)
  }
}

function ensureModeHook(): void {
  if (modeHookInstalled) return
  const win = overlay?.getWindow()
  if (!win) return
  modeHookInstalled = true
  // BrowserWindow emits 'show' on every show, including the windowing layer's
  // opacity-show after a PoE-blur hide. Re-apply current mode to survive that.
  win.on('show', () => {
    // Defer to the next tick so the windowing layer's setIgnoreMouseEvents(false)
    // has already run before we override.
    setImmediate(applyMode)
  })
}

ipcMain.on('whiteboard:set-mode', (_event, mode: 'edit' | 'play') => {
  currentMode = mode
  ensureModeHook()
  applyMode()
})

ipcMain.on('whiteboard:request-shown-state', (event) => {
  // The renderer asks for the shown event when its toolbar mounts late and
  // missed the original onFirstShow push (the Toolbar gates its mount on an
  // async version probe; if that resolves slower than setImmediate, the IPC
  // arrives before any handler is subscribed and is dropped).
  if (overlay?.isVisible() && !event.sender.isDestroyed()) {
    event.sender.send('whiteboard:shown')
  }
})

ipcMain.on('whiteboard:request-close', () => {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  // Tell renderer to flush dirty state synchronously before we hide.
  win.webContents.send('whiteboard:please-flush')
  // Hide on the next tick so the renderer has a frame to fire its flush IPC.
  setImmediate(() => {
    // Reset the toolbar to its entrance-start state under the cover of
    // opacity=0 so the next open animates in cleanly.
    overlay?.send('whiteboard:hidden')
    overlay?.hide()
  })
})
