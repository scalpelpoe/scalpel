import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/test/app'),
    isPackaged: false,
  },
  protocol: {
    handle: vi.fn(),
    registerSchemesAsPrivileged: vi.fn(),
  },
}))

beforeEach(async () => {
  vi.resetModules()
})

describe('scalpel-internal URL parsing', () => {
  it('extracts the module name from scalpel-internal://sdk.js', () => {
    const url = new URL('scalpel-internal://sdk.js')
    const name = url.hostname + (url.pathname === '/' ? '' : url.pathname.replace(/^\//, ''))
    expect(name).toBe('sdk.js')
  })

  it('extracts the module name from scalpel-internal://react.js', () => {
    const url = new URL('scalpel-internal://react.js')
    const name = url.hostname + (url.pathname === '/' ? '' : url.pathname.replace(/^\//, ''))
    expect(name).toBe('react.js')
  })
})

describe('internalAssetDir', () => {
  it('resolves under app.getAppPath()/out/scalpel-internal when not packaged', async () => {
    const { app } = await import('electron')
    vi.mocked(app.getAppPath).mockReturnValue('/test/app')
    vi.mocked(app as { isPackaged: boolean }).isPackaged = false
    const { internalAssetDir } = await import('./protocol')
    expect(internalAssetDir()).toBe(join('/test/app', 'out', 'scalpel-internal'))
  })

  it('resolves under app.getAppPath()/out/scalpel-internal when packaged (asar path)', async () => {
    const { app } = await import('electron')
    vi.mocked(app.getAppPath).mockReturnValue('/test/app/resources/app.asar')
    vi.mocked(app as { isPackaged: boolean }).isPackaged = true
    const { internalAssetDir } = await import('./protocol')
    expect(internalAssetDir()).toBe(join('/test/app/resources/app.asar', 'out', 'scalpel-internal'))
  })
})
