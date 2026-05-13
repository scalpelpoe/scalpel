import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/test/userData') },
}))

beforeEach(async () => {
  vi.resetModules()
})

describe('plugin paths', () => {
  it('pluginsDir returns userData/plugins', async () => {
    const { pluginsDir } = await import('./paths')
    expect(pluginsDir()).toBe(join('/test/userData', 'plugins'))
  })

  it('pluginDir(id) returns the per-plugin directory', async () => {
    const { pluginDir } = await import('./paths')
    expect(pluginDir('jewel-economy')).toBe(join('/test/userData', 'plugins', 'jewel-economy'))
  })

  it('installedJsonPath returns userData/plugins/installed.json', async () => {
    const { installedJsonPath } = await import('./paths')
    expect(installedJsonPath()).toBe(join('/test/userData', 'plugins', 'installed.json'))
  })

  it('pluginEntryPath returns userData/plugins/<id>/plugin.js', async () => {
    const { pluginEntryPath } = await import('./paths')
    expect(pluginEntryPath('jewel-economy')).toBe(join('/test/userData', 'plugins', 'jewel-economy', 'plugin.js'))
  })

  it('pluginManifestPath returns userData/plugins/<id>/manifest.json', async () => {
    const { pluginManifestPath } = await import('./paths')
    expect(pluginManifestPath('jewel-economy')).toBe(
      join('/test/userData', 'plugins', 'jewel-economy', 'manifest.json'),
    )
  })
})
