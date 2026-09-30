import type { ProfileState } from '@scalpel/stream-contract'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import type { StreamOverview } from '@shared/contracts/stream'
import type { AppSettings } from '@shared/types'
import { app, ipcMain } from 'electron'
import type Store from 'electron-store'
import { getAppWindow } from '../app-window'
import { getOverlayWindow } from '../overlay'
import { createStreamRuntime, type StreamRuntime, type StreamSettingsPatch } from '../stream/runtime'

const CH = IPC_CHANNELS.STREAM

let runtime: StreamRuntime | null = null

/** The live stream runtime, for other main-process callers (e.g. the slot-patch macro). */
export function getStreamRuntime(): StreamRuntime | null {
  return runtime
}

/** The Settings panel renders in both the app window and the overlay. */
function sendOverview(overview: StreamOverview): void {
  for (const win of [getAppWindow(), getOverlayWindow()]) {
    if (win && !win.isDestroyed()) win.webContents.send(CH.OVERVIEW_EVENT, overview)
  }
}

export function registerStreamHandlers(store: Store<AppSettings>): void {
  const rt = createStreamRuntime(store, sendOverview)
  runtime = rt

  ipcMain.handle(CH.GET_OVERVIEW, () => rt.getOverview())
  ipcMain.handle(CH.ENABLE, () => rt.enable())
  ipcMain.handle(CH.DISABLE, () => rt.disable())
  ipcMain.handle(CH.DELETE_PROFILE, () => rt.deleteProfile())
  ipcMain.handle(CH.PAIRING_CODE, () => rt.pairingCode())
  ipcMain.handle(CH.SET_STATE, (_evt, state: ProfileState) => rt.setState(state))
  ipcMain.handle(CH.UPDATE_SETTINGS, (_evt, patch: StreamSettingsPatch) => rt.updateSettings(patch ?? {}))
  ipcMain.handle(CH.PUSH_NOW, () => rt.pushNow())
  ipcMain.handle(CH.LIST_CHARACTERS, () => rt.listCharacters())

  // net.fetch needs a ready app; the publisher's first cycle may fetch.
  void app.whenReady().then(() => rt.publisher.start())
  app.on('will-quit', () => rt.publisher.stop())
}
