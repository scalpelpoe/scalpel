import { ipcMain } from 'electron'
import { platform } from '@scalpel/platform'
import { GAME_TITLES } from '@shared/contracts/game-variant'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import { getPoeVersion } from '../game-state'

export function register(): void {
  ipcMain.handle(IPC_CHANNELS.SCREEN.GET_GAME_WINDOW_SOURCE, () =>
    platform().capture.gameWindowSource(GAME_TITLES[getPoeVersion()]),
  )
}
