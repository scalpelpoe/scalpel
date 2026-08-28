import { app } from 'electron'
import { recordMainBreadcrumb, recordMainDiagnostic } from './diagnostics'
import { pluginNativeBackends } from './plugins/native-backend'
import { flushAll as flushPluginStorage } from './plugins/storage'

let restarting = false

export async function gracefulShutdown(): Promise<void> {
  flushPluginStorage()
  try {
    await pluginNativeBackends.shutdown()
  } catch (error) {
    recordMainDiagnostic('native-shutdown', error)
    pluginNativeBackends.stopAllNow()
  }
}

/** The one in-process relaunch path: quiesce native workers and flush plugin
 * storage before Electron starts the replacement process. */
export async function gracefulRestart(
  options: { exitImmediately?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (!app.isPackaged) {
    console.warn('[app-restart] dev build - close and `npm run dev` to re-attach')
    return { ok: false, error: 'Restart the development process manually.' }
  }
  if (restarting) return { ok: true }
  restarting = true
  recordMainBreadcrumb('graceful-restart')
  try {
    // Do every fallible filesystem operation before stopping live workers.
    flushPluginStorage()
    app.relaunch()
    try {
      await pluginNativeBackends.shutdown()
    } catch (error) {
      recordMainDiagnostic('native-shutdown', error)
      pluginNativeBackends.stopAllNow()
    }
    if (options.exitImmediately) app.exit(0)
    else app.quit()
    return { ok: true }
  } catch (error) {
    restarting = false
    recordMainDiagnostic('graceful-restart', error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
