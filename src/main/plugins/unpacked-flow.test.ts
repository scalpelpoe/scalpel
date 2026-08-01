import { describe, expect, it, vi } from 'vitest'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import type { UnpackedFlowDeps } from './unpacked-flow'

const manifest = (version = '1.0.0'): PluginManifest =>
  ({
    manifestVersion: 1,
    id: 'hello-world',
    version,
    name: 'Hello World',
    description: 'd',
    author: 'a',
    scalpelMinVersion: '>=0.0.0',
  }) as PluginManifest

function deps(overrides: Partial<UnpackedFlowDeps> = {}): UnpackedFlowDeps {
  return {
    installedIds: () => [],
    install: vi.fn(() => ({ ok: true as const, id: 'hello-world' })),
    manifestOf: () => manifest(),
    entryUrl: (id, version) => `scalpel-plugin://${id}/plugin.js?v=${version}-1`,
    broadcast: vi.fn(),
    reloadOverlay: vi.fn(),
    sourceDirOf: () => '/src/hello-world',
    dirExists: () => true,
    ...overrides,
  }
}

describe('installUnpackedAndNotify', () => {
  it('broadcasts plugin-installed for an id that was not installed yet', async () => {
    const { installUnpackedAndNotify } = await import('./unpacked-flow')
    const d = deps()
    const r = installUnpackedAndNotify('/src/hello-world', d)
    expect(r).toEqual({ ok: true, id: 'hello-world' })
    expect(d.broadcast).toHaveBeenCalledWith('plugin-installed', {
      manifest: manifest(),
      entryUrl: 'scalpel-plugin://hello-world/plugin.js?v=1.0.0-1',
    })
    expect(d.reloadOverlay).not.toHaveBeenCalled()
  })

  it('broadcasts plugin-updated when re-installing over a running plugin', async () => {
    const { installUnpackedAndNotify } = await import('./unpacked-flow')
    const d = deps({ installedIds: () => ['hello-world'] })
    installUnpackedAndNotify('/src/hello-world', d)
    expect(d.broadcast).toHaveBeenCalledWith('plugin-updated', {
      manifest: manifest(),
      entryUrl: 'scalpel-plugin://hello-world/plugin.js?v=1.0.0-1',
    })
  })

  it('reloads a popped-out overlay window on re-install', async () => {
    const { installUnpackedAndNotify } = await import('./unpacked-flow')
    const d = deps({ installedIds: () => ['hello-world'] })
    installUnpackedAndNotify('/src/hello-world', d)
    expect(d.reloadOverlay).toHaveBeenCalledWith('hello-world')
  })

  it('checks the installed set before installing, not after', async () => {
    const { installUnpackedAndNotify } = await import('./unpacked-flow')
    // A naive "is it installed?" check made after install() always sees the id.
    let installed: string[] = []
    const d = deps({
      installedIds: () => installed,
      install: vi.fn(() => {
        installed = ['hello-world']
        return { ok: true as const, id: 'hello-world' }
      }),
    })
    installUnpackedAndNotify('/src/hello-world', d)
    expect(d.broadcast).toHaveBeenCalledWith('plugin-installed', expect.anything())
  })

  it('does not broadcast when the install fails', async () => {
    const { installUnpackedAndNotify } = await import('./unpacked-flow')
    const d = deps({ install: vi.fn(() => ({ ok: false as const, error: 'boom' })) })
    const r = installUnpackedAndNotify('/src/hello-world', d)
    expect(r).toEqual({ ok: false, error: 'boom' })
    expect(d.broadcast).not.toHaveBeenCalled()
    expect(d.reloadOverlay).not.toHaveBeenCalled()
  })

  it('does not broadcast when the installed manifest cannot be read back', async () => {
    const { installUnpackedAndNotify } = await import('./unpacked-flow')
    const d = deps({ manifestOf: () => undefined })
    expect(installUnpackedAndNotify('/src/hello-world', d)).toEqual({ ok: true, id: 'hello-world' })
    expect(d.broadcast).not.toHaveBeenCalled()
  })
})

describe('reloadUnpackedPlugin', () => {
  it('re-installs from the recorded source dir and hot-swaps the running plugin', async () => {
    const { reloadUnpackedPlugin } = await import('./unpacked-flow')
    const d = deps({ installedIds: () => ['hello-world'] })
    const r = reloadUnpackedPlugin('hello-world', d)
    expect(r).toEqual({ ok: true, id: 'hello-world' })
    expect(d.install).toHaveBeenCalledWith('/src/hello-world')
    expect(d.broadcast).toHaveBeenCalledWith('plugin-updated', expect.anything())
  })

  it('fails when no source dir was recorded for the plugin', async () => {
    const { reloadUnpackedPlugin } = await import('./unpacked-flow')
    const d = deps({ sourceDirOf: () => null })
    const r = reloadUnpackedPlugin('hello-world', d)
    expect(r.ok).toBe(false)
    expect(d.install).not.toHaveBeenCalled()
  })

  it('fails when the source dir no longer exists', async () => {
    const { reloadUnpackedPlugin } = await import('./unpacked-flow')
    const d = deps({ dirExists: () => false })
    const r = reloadUnpackedPlugin('hello-world', d)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('/src/hello-world')
    expect(d.install).not.toHaveBeenCalled()
  })
})
