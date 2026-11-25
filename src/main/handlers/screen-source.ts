import { ipcMain } from 'electron'
import { getGameTitleForVariant, platform } from '@scalpel/platform'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import { getPoeVersion } from '../game-state'

export function register(): void {
  ipcMain.handle(IPC_CHANNELS.SCREEN.GET_GAME_WINDOW_SOURCE, () =>
    platform().capture.gameWindowSource(getGameTitleForVariant(getPoeVersion())),
  )
}
