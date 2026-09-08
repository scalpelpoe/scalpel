import { app } from 'electron'
import { recordMainBreadcrumb, recordMainDiagnostic } from './diagnostics'
import { pluginNativeBackends } from './plugins/native-backend'
import { flushAll as flushPluginStorage } from './plugins/storage'

const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 3_000

let restarting = false
let shutdownPromise: Promise<void> | null = null
let shutdownComplete = false
let quitHandlerRegistered = false
let quitAfterShutdownRequested = false

export function gracefulShutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise

  // shutdown() blocks new calls synchronously before its first await.
  const nativeShutdown = pluginNativeBackends.shutdown()
  shutdownPromise = (async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        nativeShutdown,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('native shutdown timed out')), GRACEFUL_SHUTDOWN_TIMEOUT_MS)
        }),
      ])
    } catch (error) {
      recordMainDiagnostic('native-shutdown', error)
      pluginNativeBackends.stopAllNow()
    } finally {
      if (timeout) clearTimeout(timeout)
    }
    try {
      flushPluginStorage()
    } catch (error) {
      recordMainDiagnostic('plugin-storage-flush', error)
    }
  })().finally(() => {
    shutdownComplete = true
  })
  return shutdownPromise
}

/** Delay Electron's normal quit once so native workers can use their bounded,
 * confirmed stop sequence. Restart and updater paths call gracefulShutdown
 * themselves, so their later quit is allowed through immediately. */
export function registerGracefulQuit(): void {
  if (quitHandlerRegistered) return
  quitHandlerRegistered = true
  app.on('before-quit', (event) => {
    if (shutdownComplete) return
    event.preventDefault()
    if (quitAfterShutdownRequested) return
    quitAfterShutdownRequested = true
    void gracefulShutdown().finally(() => app.quit())
  })
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
    // Do fallible relaunch setup before permanently stopping live workers.
    flushPluginStorage()
    app.relaunch()
    await gracefulShutdown()
    if (options.exitImmediately) app.exit(0)
    else app.quit()
    return { ok: true }
  } catch (error) {
    restarting = false
    recordMainDiagnostic('graceful-restart', error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
