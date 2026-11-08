import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

export interface ScalpelE2EApp {
  app: ElectronApplication
  window: Page
  userDataDir: string
  close: () => Promise<void>
  cleanup: () => Promise<void>
}

export interface ScalpelE2EOptions {
  /** Pre-seeded electron-store config values written to config.json before launch. */
  seedConfig?: Record<string, unknown>
  /** Extra files written under userData before launch, keyed by relative path
   *  (e.g. `plugins/installed.json`). Parent directories are created. */
  seedFiles?: Record<string, string | Uint8Array>
}

const CONFIG_FILE = 'config.json'

export interface PluginHostWindow {
  page: Page
  /** Page errors, console errors, and failed responses seen in the plugin host renderer. Failed requests to
   *  remote http(s) URLs are left out (see isRemoteUrl). */
  errors: string[]
}

/** The overlay renderer fetches live data feeds (drop rates, prices) and falls back to bundled data when they
 *  fail. Those sites can refuse CI runners (wraeclast.cards answers GitHub's with 403), which says nothing about
 *  plugins. Failures on scalpel-plugin://, scalpel-internal:// and file:// URLs are still reported. */
function isRemoteUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://')
}

/** Open a hidden overlay renderer, the window that activates installed plugins. The e2e app has
 *  no game window to attach the real overlay to, so tests that need plugins running open this one. */
export async function openPluginHostWindow(scalpel: ScalpelE2EApp): Promise<PluginHostWindow> {
  const hostWindow = scalpel.app.waitForEvent('window')
  await scalpel.app.evaluate(
    async ({ BrowserWindow }, paths) => {
      const win = new BrowserWindow({
        show: false,
        webPreferences: { preload: paths.preload, sandbox: false, contextIsolation: true },
      })
      ;(globalThis as unknown as Record<string, unknown>).__scalpelPluginE2EWindow = win
      await win.loadFile(paths.html)
    },
    {
      html: join(process.cwd(), 'out', 'renderer', 'index.html'),
      preload: join(process.cwd(), 'out', 'preload', 'index.js'),
    },
  )
  const page = await hostWindow
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    // Chromium reports a failed resource load with the resource's URL as the message location.
    if (message.text().startsWith('Failed to load resource') && isRemoteUrl(message.location().url)) return
    errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && !isRemoteUrl(response.url())) errors.push(`${response.status()} ${response.url()}`)
  })
  await page.waitForLoadState('domcontentloaded')
  return { page, errors }
}

export async function launchScalpelE2E(opts?: ScalpelE2EOptions): Promise<ScalpelE2EApp> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'scalpel-e2e-'))
  try {
    if (opts?.seedConfig) {
      writeFileSync(join(userDataDir, CONFIG_FILE), JSON.stringify(opts.seedConfig))
    }
    for (const [rel, contents] of Object.entries(opts?.seedFiles ?? {})) {
      const target = join(userDataDir, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, contents)
    }
    const app = await electron.launch({
      args: [process.cwd()],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SCALPEL_E2E: '1',
        SCALPEL_E2E_USER_DATA: userDataDir,
      },
    })
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    let closed = false
    const close = async (): Promise<void> => {
      if (closed) return
      await app.close()
      closed = true
    }

    return {
      app,
      window,
      userDataDir,
      close,
      cleanup: async () => {
        await close().catch(() => undefined)
        await rm(userDataDir, { recursive: true, force: true })
      },
    }
  } catch (err) {
    // Launch failed before we could hand back a cleanup fn - don't leak the temp dir.
    await rm(userDataDir, { recursive: true, force: true })
    throw err
  }
}
