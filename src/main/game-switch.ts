import { app, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, GameVariant } from '../shared/types'
import { getAppWindow, showAppWindow } from './app-window'
import { applySetting } from './settings-write'

// Only one prompt may be in-flight. Extra calls while a prompt is open are
// ignored (requestGameSwitch returns immediately) so we never stack modals.
let pending: ((v: 'restart' | 'cancel') => void) | null = null

ipcMain.on('game-switch-response', (_event, choice: 'restart' | 'cancel') => {
  const resolve = pending
  pending = null
  resolve?.(choice)
})

/** Ask the user (via the app-window modal) whether to restart into the focused PoE
 *  version. If they click Restart, we persist + relaunch; if Cancel, we do nothing
 *  and a future hotkey press will re-prompt. The caller shouldn't await this --
 *  the current hotkey press is always swallowed because the overlay isn't attached
 *  to the right game yet, and the response may take seconds of user-think-time. */
export async function requestGameSwitch(store: Store<AppSettings>, target: GameVariant): Promise<void> {
  if (pending) return
  const win = getAppWindow()
  if (!win) return
  showAppWindow()

  const choice = await new Promise<'restart' | 'cancel'>((resolve) => {
    pending = resolve
    win.webContents.send('game-switch-prompt', target)
  })

  if (choice !== 'restart') return
  applySetting(store, 'poeVersion', target, null)
  if (!app.isPackaged) {
    // electron-vite dev won't come back after app.quit(); persist the version and
    // log so it's obvious the user needs to restart `npm run dev` manually. Full
    // relaunch flow runs in packaged builds.
    console.warn(`[game-switch] target=${target}; restart dev to re-attach`)
    return
  }
  app.relaunch()
  app.quit()
}
