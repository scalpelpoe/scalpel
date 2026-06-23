import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, GameVariant, RuntimeSettings } from '@shared/types'

export interface GameSwitchCoordinator {
  ensureCorrectGameForHotkey(store: Store<AppSettings>): Promise<boolean>
  requestGameSwitch(store: Store<AppSettings>, target: GameVariant): Promise<void>
  applyProfileSwitch(
    store: Store<AppSettings>,
    id: string,
    restartIfNeeded: boolean,
    sender: Electron.WebContents | null,
  ): Promise<ProfileSwitchResult>
}

export type ProfileSwitchResult =
  | { ok: false; error: string }
  | { ok: false; requiresRestart: true; targetGame: GameVariant }
  | { ok: true; settings: RuntimeSettings; devRestartRequired?: true }
  | { ok: true; restarting: true; devRestartRequired?: true }

export interface OverlayAttachStrategy {
  createInitialOverlay(version: GameVariant): BrowserWindow
  retargetForGame(target: GameVariant): void
  getOverlayAttachedVersion(): GameVariant
}
