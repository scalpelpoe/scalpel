import { BrowserWindow, ipcMain } from 'electron'
import type { TimelessTreeState } from '@shared/timeless-tree-state'
import { DEFAULT_TIMELESS_STATE } from '@shared/timeless-tree-state'
import { hideOverlay } from './overlay'
import { registerSecondaryOverlay, type SecondaryOverlay } from './windowing'

let overlay: SecondaryOverlay | null = null
let state: TimelessTreeState = { ...DEFAULT_TIMELESS_STATE }

function broadcastState(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('timeless-tree:state', state)
  }
}

export function registerTimelessTreeOverlay(): SecondaryOverlay {
  overlay = registerSecondaryOverlay({
    id: 'timeless-tree',
    htmlEntry: 'timeless-tree.html',
    defaultAnchor: () => ({ fracX: 0.05, fracY: 0.05, fracW: 0.9, fracH: 0.9 }),
    onFirstShow: (win) => {
      win.webContents.send('timeless-tree:state', state)
    },
  })

  ipcMain.on('timeless-tree:show', (_event, next?: TimelessTreeState) => {
    if (next) state = next
    hideOverlay()
    overlay?.show()
    broadcastState()
  })

  ipcMain.on('timeless-tree:request-close', () => {
    overlay?.hide()
  })

  ipcMain.on('timeless-tree:set-state', (_event, next: TimelessTreeState) => {
    state = next
    broadcastState()
  })

  ipcMain.on('timeless-tree:request-state', (event) => {
    event.sender.send('timeless-tree:state', state)
  })

  return overlay
}

export function toggleTimelessTree(): void {
  if (!overlay) return
  if (overlay.isVisible()) overlay.hide()
  else {
    hideOverlay()
    overlay.show()
    broadcastState()
  }
}
