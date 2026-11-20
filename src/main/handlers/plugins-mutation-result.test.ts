import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/test/userData'),
    getVersion: vi.fn(() => '1.0.0'),
    getAppPath: vi.fn(() => '/test/app'),
    isPackaged: false,
    on: vi.fn(),
    once: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
  },
  BrowserWindow: Object.assign(
    vi.fn(() => ({})),
    { getAllWindows: vi.fn(() => []), fromWebContents: vi.fn(() => null) },
  ),
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), once: vi.fn(), removeHandler: vi.fn(), removeAllListeners: vi.fn() },
  net: { fetch: vi.fn() },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() },
  screen: { getPrimaryDisplay: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })) },
  shell: { openExternal: vi.fn() },
  clipboard: { readText: vi.fn(() => ''), writeText: vi.fn() },
  nativeImage: { createFromBuffer: vi.fn() },
  session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
  protocol: { handle: vi.fn(), registerSchemesAsPrivileged: vi.fn() },
}))

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('mutationResult', () => {
  it('passes a successful result through untouched', async () => {
    const { mutationResult } = await import('./plugins')
    await expect(mutationResult('hello-world', () => ({ ok: true as const, id: 'hello-world' }))).resolves.toEqual({
      ok: true,
      id: 'hello-world',
    })
  })

  it('converts a thrown Error into a failed result instead of rejecting', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { mutationResult } = await import('./plugins')

    await expect(
      mutationResult('hello-world', async () => {
        throw new Error('native worker did not stop')
      }),
    ).resolves.toEqual({ ok: false, error: 'native worker did not stop' })
    expect(logged).toHaveBeenCalled()
  })

  it('stringifies a non-Error throw', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { mutationResult } = await import('./plugins')

    await expect(mutationResult('hello-world', () => Promise.reject('EBUSY'))).resolves.toEqual({
      ok: false,
      error: 'EBUSY',
    })
  })
})
