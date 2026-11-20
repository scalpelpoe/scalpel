import { BrowserWindow, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import { reloadPluginOverlay, disposePluginOverlay } from '../plugin-overlay'
import { removePluginHotkey } from '../plugins/hotkey-registry'
import { validateDependencyMutation } from '../plugins/dependency-mutation'
import { commitRegistryInstall, prepareRegistryInstall } from '../plugins/install-from-registry'
import { installUnpacked } from '../plugins/install-unpacked'
import { readInstalledIds } from '../plugins/installed-list'
import { getInstalledPlugins, getUnpackedPlugins } from '../plugins/manager'
import { pluginNativeBackends } from '../plugins/native-backend'
import { resolveRegistrySelection } from '../plugins/registry-selection'
import { removeStorageNow } from '../plugins/storage'
import { removePluginTab } from '../plugins/tab-registry'
import { uninstallPlugin } from '../plugins/uninstall'
import { getUnpackedSourceDir } from '../plugins/unpacked-list'
import { register } from './plugins'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/test/userData'), getVersion: vi.fn(() => '1.0.0'), isPackaged: false },
  BrowserWindow: Object.assign(
    vi.fn(() => ({})),
    { getAllWindows: vi.fn(() => []), fromWebContents: vi.fn(() => null) },
  ),
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('../app-macros', () => ({ refreshAppMacros: vi.fn() }))
vi.mock('../evaluation', () => ({ runMainHotkeyFlow: vi.fn() }))
vi.mock('../overlay', () => ({ getOverlayWindow: vi.fn(() => null), showOverlay: vi.fn() }))
vi.mock('../plugin-overlay', () => ({
  disposePluginOverlay: vi.fn(),
  hidePluginOverlay: vi.fn(),
  isPluginOverlayVisible: vi.fn(),
  reloadPluginOverlay: vi.fn(),
  registerPluginAnnotationOverlay: vi.fn(),
  registerPluginOverlay: vi.fn(),
  showPluginOverlay: vi.fn(),
}))
vi.mock('../plugins/hotkey-registry', () => ({
  getRegisteredOverlayHotkeys: vi.fn(() => new Map()),
  getRegisteredPluginHotkeys: vi.fn(() => new Map()),
  removePluginHotkey: vi.fn(),
  removePluginOverlayHotkey: vi.fn(),
  setPluginHotkey: vi.fn(),
  setPluginOverlayHotkey: vi.fn(),
}))
vi.mock('../plugins/tab-registry', () => ({
  getRegisteredPluginTabs: vi.fn(() => new Map()),
  removePluginTab: vi.fn(),
  setPluginTab: vi.fn(),
}))
vi.mock('../plugins/entry-url', () => ({
  versionedPluginEntryUrl: vi.fn((id: string, version: string) => `scalpel-plugin://${id}/plugin.js?v=${version}-1`),
}))
vi.mock('../plugins/dependency-mutation', () => ({ validateDependencyMutation: vi.fn(() => null) }))
vi.mock('../plugins/install-from-registry', () => ({
  commitRegistryInstall: vi.fn(),
  prepareRegistryInstall: vi.fn(),
}))
vi.mock('../plugins/install-unpacked', () => ({ installUnpacked: vi.fn() }))
vi.mock('../plugins/loadability', () => ({ resolvePluginLoadability: vi.fn() }))
vi.mock('../plugins/manager', () => ({ getInstalledPlugins: vi.fn(() => []), getUnpackedPlugins: vi.fn(() => []) }))
vi.mock('../plugins/overlay-anchors', () => ({
  clearPluginOverlayAnchor: vi.fn(),
  getPluginOverlayAnchor: vi.fn(),
  setPluginOverlayAnchor: vi.fn(),
}))
vi.mock('../plugins/plugin-protocol', () => ({
  pluginEntryUrl: vi.fn((id: string) => `scalpel-plugin://${id}/plugin.js`),
}))
vi.mock('../plugins/registry', () => ({ fetchRegistry: vi.fn() }))
vi.mock('../plugins/registry-selection', () => ({ resolveRegistrySelection: vi.fn() }))
vi.mock('../plugins/storage', () => ({
  deleteValue: vi.fn(),
  getValue: vi.fn(),
  listKeys: vi.fn(),
  removeStorageNow: vi.fn(),
  setValue: vi.fn(),
}))
vi.mock('../plugins/installed-list', () => ({ readInstalledIds: vi.fn(() => []) }))
vi.mock('../plugins/uninstall', () => ({ uninstallPlugin: vi.fn() }))
vi.mock('../plugins/unpacked-list', () => ({ getUnpackedSourceDir: vi.fn(() => null) }))

const PLUGIN_ID = 'hello-world'

const manifest = (version: string): PluginManifest =>
  ({
    manifestVersion: 1,
    id: PLUGIN_ID,
    version,
    name: 'Hello World',
    description: 'd',
    author: 'a',
    scalpelMinVersion: '>=0.0.0',
  }) as PluginManifest

const installedPlugin = (version: string) => ({
  manifest: manifest(version),
  entryPath: `/plugins/${PLUGIN_ID}/plugin.js`,
  manifestPath: `/plugins/${PLUGIN_ID}/manifest.json`,
})

interface Sent {
  window: number
  channel: string
  payload: unknown
  blocked: string[]
}

describe('registry mutations hot-apply', () => {
  let sent: Sent[]
  let installed: Array<ReturnType<typeof installedPlugin>>
  let blockedDuringMutation: string[] | null

  const handler = (channel: string) => {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([registered]) => registered === channel)
    if (!call) throw new Error(`no handler registered for ${channel}`)
    return call[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>
  }
  const sentOn = (channel: string): Sent[] => sent.filter((entry) => entry.channel === channel)

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    sent = []
    installed = []
    blockedDuringMutation = null
    const fakeWindow = (window: number) => ({
      webContents: {
        send: vi.fn((channel: string, payload?: unknown) => {
          sent.push({ window, channel, payload, blocked: [...pluginNativeBackends.loadBlockedPluginIds()] })
        }),
      },
    })
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([fakeWindow(1), fakeWindow(2)] as unknown as BrowserWindow[])
    vi.mocked(getInstalledPlugins).mockImplementation(() => installed)
    vi.mocked(resolveRegistrySelection).mockResolvedValue({
      ok: true,
      entry: { id: PLUGIN_ID } as never,
    })
    vi.mocked(prepareRegistryInstall).mockResolvedValue({ ok: true, prepared: { entry: { id: PLUGIN_ID } } as never })
    vi.mocked(commitRegistryInstall).mockImplementation(() => {
      blockedDuringMutation = [...pluginNativeBackends.loadBlockedPluginIds()]
      installed = [installedPlugin('2.0.0')]
      return { ok: true, id: PLUGIN_ID }
    })
    vi.mocked(uninstallPlugin).mockImplementation(() => {
      blockedDuringMutation = [...pluginNativeBackends.loadBlockedPluginIds()]
      installed = []
      return { ok: true }
    })
    register({ get: vi.fn() } as unknown as Store<AppSettings>)
  })

  it('broadcasts plugin-updated after the lock is released and reloads the pop-out', async () => {
    installed = [installedPlugin('1.0.0')]

    const result = await handler('plugins:update-from-registry')({}, { id: PLUGIN_ID })

    expect(result).toStrictEqual({ ok: true, id: PLUGIN_ID })
    expect(blockedDuringMutation).toEqual([PLUGIN_ID])
    const payload = { manifest: manifest('2.0.0'), entryUrl: `scalpel-plugin://${PLUGIN_ID}/plugin.js?v=2.0.0-1` }
    expect(sentOn('plugin-updated')).toEqual([
      { window: 1, channel: 'plugin-updated', payload, blocked: [] },
      { window: 2, channel: 'plugin-updated', payload, blocked: [] },
    ])
    expect(sentOn('plugin-installed')).toEqual([])
    expect(reloadPluginOverlay).toHaveBeenCalledExactlyOnceWith(PLUGIN_ID)
  })

  it('broadcasts plugin-installed for a fresh install without reloading a pop-out', async () => {
    const result = await handler('plugins:install-from-registry')({}, { id: PLUGIN_ID })

    expect(result).toStrictEqual({ ok: true, id: PLUGIN_ID })
    const payload = { manifest: manifest('2.0.0'), entryUrl: `scalpel-plugin://${PLUGIN_ID}/plugin.js?v=2.0.0-1` }
    expect(sentOn('plugin-installed')).toEqual([
      { window: 1, channel: 'plugin-installed', payload, blocked: [] },
      { window: 2, channel: 'plugin-installed', payload, blocked: [] },
    ])
    expect(sentOn('plugin-updated')).toEqual([])
    expect(reloadPluginOverlay).not.toHaveBeenCalled()
  })

  it('passes a commit failure through without notifying any window', async () => {
    installed = [installedPlugin('1.0.0')]
    vi.mocked(commitRegistryInstall).mockReturnValue({ ok: false, error: 'install write failed: EBUSY' })

    const result = await handler('plugins:update-from-registry')({}, { id: PLUGIN_ID })

    expect(result).toStrictEqual({ ok: false, error: 'install write failed: EBUSY' })
    expect(sent).toEqual([])
    expect(reloadPluginOverlay).not.toHaveBeenCalled()
    expect([...pluginNativeBackends.loadBlockedPluginIds()]).toEqual([])
  })

  it('hot-unloads a registry uninstall after the lock is released', async () => {
    installed = [installedPlugin('1.0.0')]
    vi.mocked(readInstalledIds).mockReturnValue([PLUGIN_ID])

    const result = await handler('plugins:uninstall')({}, PLUGIN_ID)

    expect(result).toStrictEqual({ ok: true })
    expect(blockedDuringMutation).toEqual([PLUGIN_ID])
    expect(sentOn('plugin-uninstalled')).toEqual([
      { window: 1, channel: 'plugin-uninstalled', payload: PLUGIN_ID, blocked: [] },
      { window: 2, channel: 'plugin-uninstalled', payload: PLUGIN_ID, blocked: [] },
    ])
    expect(removeStorageNow).toHaveBeenCalledExactlyOnceWith(PLUGIN_ID)
    expect(disposePluginOverlay).toHaveBeenCalledExactlyOnceWith(PLUGIN_ID)
    expect(removePluginTab).toHaveBeenCalledExactlyOnceWith(PLUGIN_ID)
    expect(removePluginHotkey).toHaveBeenCalledExactlyOnceWith(PLUGIN_ID)
  })

  it('leaves a registry plugin in place when removing it would break a dependent', async () => {
    installed = [installedPlugin('1.0.0')]
    vi.mocked(readInstalledIds).mockReturnValue([PLUGIN_ID])
    vi.mocked(validateDependencyMutation).mockReturnValue('plugin "consumer" requires plugin "hello-world"')

    const result = await handler('plugins:uninstall')({}, PLUGIN_ID)

    expect(result).toStrictEqual({
      ok: false,
      error: 'plugin dependency check failed: plugin "consumer" requires plugin "hello-world"',
    })
    expect(uninstallPlugin).not.toHaveBeenCalled()
    expect(sentOn('plugin-uninstalled')).toEqual([])
    expect(removeStorageNow).not.toHaveBeenCalled()
  })

  it('hot-unloads an unpacked uninstall through the same post-lock cleanup', async () => {
    installed = [installedPlugin('1.0.0')]
    vi.mocked(getUnpackedPlugins).mockImplementation(() => installed)
    vi.mocked(readInstalledIds).mockReturnValue([PLUGIN_ID])

    const result = await handler('plugins:uninstall-unpacked')({}, PLUGIN_ID)

    expect(result).toStrictEqual({ ok: true })
    expect(sentOn('plugin-uninstalled').map((entry) => entry.blocked)).toEqual([[], []])
    expect(removeStorageNow).toHaveBeenCalledExactlyOnceWith(PLUGIN_ID)
    expect(removePluginTab).toHaveBeenCalledExactlyOnceWith(PLUGIN_ID)
  })

  it('broadcasts an unpacked reload only after the lock is released', async () => {
    installed = [installedPlugin('1.0.0')]
    vi.mocked(getUnpackedSourceDir).mockReturnValue(process.cwd())
    vi.mocked(installUnpacked).mockImplementation(() => {
      blockedDuringMutation = [...pluginNativeBackends.loadBlockedPluginIds()]
      installed = [installedPlugin('1.0.1')]
      return { ok: true, id: PLUGIN_ID }
    })

    const result = await handler('plugins:reload-unpacked')({}, PLUGIN_ID)

    expect(result).toStrictEqual({ ok: true, id: PLUGIN_ID })
    expect(blockedDuringMutation).toEqual([PLUGIN_ID])
    expect(sentOn('plugin-updated').map((entry) => entry.blocked)).toEqual([[], []])
    expect(reloadPluginOverlay).toHaveBeenCalledExactlyOnceWith(PLUGIN_ID)
  })

  it('registers no restart-required handler', () => {
    const channels = vi.mocked(ipcMain.handle).mock.calls.map(([channel]) => channel)
    expect(channels).toContain('plugins:uninstall')
    expect(channels).not.toContain('plugins:restart-required')
  })
})
