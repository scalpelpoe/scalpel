import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_USER_DATA = vi.hoisted(() =>
  require('node:path').join(require('node:os').tmpdir(), `scalpel-updater-${Date.now()}`),
)
// IS_DEV is captured at module load and gates every destructive handler off.
vi.hoisted(() => {
  delete process.env.ELECTRON_RENDERER_URL
})

const HANDLERS = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())
const SPAWN = vi.hoisted(() => vi.fn(() => ({ unref: vi.fn() })))
const APP_EXIT = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ spawn: SPAWN, execSync: vi.fn() }))
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => MOCK_USER_DATA),
    getVersion: vi.fn(() => '1.0.2-rc4'),
    exit: APP_EXIT,
    relaunch: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn((channel: string, fn: (...args: unknown[]) => unknown) => HANDLERS.set(channel, fn)),
    on: vi.fn(),
  },
}))
vi.mock('../diagnostics', () => ({ recordMainBreadcrumb: vi.fn(), registerDiagnosticProvider: vi.fn() }))
vi.mock('../hotkeys', () => ({ stopHotkeyListener: vi.fn() }))

import './updater'

const STAGING = join(MOCK_USER_DATA, 'update-staging')
const RESOURCES = join(MOCK_USER_DATA, 'resources')
const BAT_PATH = join(MOCK_USER_DATA, 'apply-update.bat')
const NATIVE = { 'electron-overlay-window': '4.1.0', 'uiohook-napi': '1.5.4' }

/** Executables that allocate their own visible console when launched from the detached,
 *  console-less cmd the applier runs in. This list is the whole of #543. */
const CONSOLE_ALLOCATING =
  /\b(ping|timeout|xcopy|robocopy|powershell|pwsh|choice|waitfor|curl|certutil|forfiles|wmic)\b/i

/** Quoted paths are data, not commands, and a user's directory could contain any word. */
const commandsOnly = (bat: string): string[] => bat.split('\r\n').map((l) => l.replace(/"[^"]*"/g, '""'))

function stage({ installedNative = NATIVE }: { installedNative?: Record<string, string> } = {}): void {
  rmSync(MOCK_USER_DATA, { recursive: true, force: true })
  mkdirSync(STAGING, { recursive: true })
  mkdirSync(join(STAGING, 'app.asar.unpacked'), { recursive: true })
  mkdirSync(join(RESOURCES, 'app.asar.unpacked'), { recursive: true })
  writeFileSync(join(STAGING, 'app.asar.new'), 'asar bytes')
  writeFileSync(join(STAGING, 'manifest.pending.json'), JSON.stringify({ version: '1.0.2-rc5', nativeModules: NATIVE }))
  writeFileSync(
    join(MOCK_USER_DATA, 'install-manifest.json'),
    JSON.stringify({ version: '1.0.2-rc4', nativeModules: installedNative }),
  )
  // The handler derives the install layout from resourcesPath; point it at the temp tree
  // so the unpacked-dir comparison has something real to look at.
  ;(process as { resourcesPath?: string }).resourcesPath = RESOURCES
}

describe('install-update', () => {
  beforeEach(() => {
    SPAWN.mockClear()
    APP_EXIT.mockClear()
    stage()
  })

  it('spawns the apply batch detached so it outlives app.exit', async () => {
    await HANDLERS.get('install-update')?.()

    // Regression guard for the rc4/rc5 dead-update bug: libuv puts every non-detached
    // child into a job object with JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, so dropping
    // `detached` means Windows kills the batch the moment app.exit() runs and no update
    // ever applies. `.unref()` does not substitute for it.
    expect(SPAWN).toHaveBeenCalledTimes(1)
    const [command, args, options] = SPAWN.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
    expect(command).toBe('cmd.exe')
    expect(args).toEqual(['/c', BAT_PATH])
    expect(options.detached).toBe(true)
    expect(options.stdio).toBe('ignore')
    expect(options.windowsHide).toBe(true)
  })

  it('uses only cmd built-ins, so nothing flashes a console', async () => {
    await HANDLERS.get('install-update')?.()

    // The batch runs detached and so has no console of its own; any external executable
    // it launches gets a fresh visible one (#543). Restoring `detached` made that the
    // cost of a working update, and this is what keeps the cost at zero.
    const offenders = commandsOnly(readFileSync(BAT_PATH, 'utf8')).filter((l) => CONSOLE_ALLOCATING.test(l))
    expect(offenders).toEqual([])
  })

  it('retries the asar copy instead of sleeping, since the old process still holds it', async () => {
    await HANDLERS.get('install-update')?.()

    const bat = readFileSync(BAT_PATH, 'utf8')
    expect(bat).toContain(join(STAGING, 'app.asar.new'))
    expect(bat).toMatch(/goto asar_retry/)
    // A dead end here would leave the user on an install that never comes back.
    expect(bat).toContain(':giveup')
    expect(APP_EXIT).toHaveBeenCalledWith(0)
  })

  it('skips the native-module copy when nothing about them changed', async () => {
    await HANDLERS.get('install-update')?.()

    expect(readFileSync(BAT_PATH, 'utf8')).not.toContain('xcopy')
  })

  it('copies native modules when a version moved', async () => {
    stage({ installedNative: { 'electron-overlay-window': '4.0.0', 'uiohook-napi': '1.5.4' } })
    await HANDLERS.get('install-update')?.()

    expect(readFileSync(BAT_PATH, 'utf8')).toContain('xcopy')
  })

  it('records the pending version so the post-update banner can name it', async () => {
    await HANDLERS.get('install-update')?.()

    const justUpdated = JSON.parse(readFileSync(join(MOCK_USER_DATA, 'just-updated.json'), 'utf8'))
    expect(justUpdated.version).toBe('1.0.2-rc5')
  })
})
