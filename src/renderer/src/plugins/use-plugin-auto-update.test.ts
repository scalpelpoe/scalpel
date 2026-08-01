// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePluginAutoUpdate } from './use-plugin-auto-update'

type Cb = () => void
let showCb: Cb | null

function installApi(over: Record<string, unknown> = {}): {
  update: ReturnType<typeof vi.fn>
} {
  showCb = null
  const update = vi.fn(async () => ({ ok: true, id: 'demo' }))
  ;(window as unknown as { api: Record<string, unknown> }).api = {
    getSettings: vi.fn(async () => ({ pluginAutoUpdate: true, pluginRegistryUrl: undefined })),
    listInstalledPlugins: vi.fn(async () => [
      { manifest: { id: 'demo', name: 'Demo', version: '1.0.0', author: 'a' }, entryUrl: '' },
    ]),
    pluginFetchRegistry: vi.fn(async () => ({
      ok: true,
      snapshot: {
        schemaVersion: 1,
        plugins: [
          {
            id: 'demo',
            name: 'Demo',
            author: 'a',
            description: 'd',
            repo: 'a/demo',
            latestVersion: '2.0.0',
            scalpelMinVersion: '>=0.0.0',
            sha256: '0'.repeat(64),
          },
        ],
      },
    })),
    pluginUpdateFromRegistry: update,
    pluginOverlayVisible: vi.fn(async () => false),
    onOverlayHide: vi.fn(() => () => {}),
    onOverlayShow: vi.fn((cb: Cb) => {
      showCb = cb
      return () => {}
    }),
    onSettingUpdated: vi.fn(() => () => {}),
    ...over,
  }
  return { update }
}

beforeEach(() => vi.useRealTimers())
afterEach(() => vi.restoreAllMocks())

describe('usePluginAutoUpdate', () => {
  it('applies an outdated plugin on launch (overlay starts hidden) and reports it on show', async () => {
    const { update } = installApi()
    const onApplied = vi.fn()
    renderHook(() => usePluginAutoUpdate({ onApplied }))

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect((update.mock.calls[0][0] as { id: string }).id).toBe('demo')

    showCb?.()
    expect(onApplied).toHaveBeenCalledWith([{ name: 'Demo', version: '2.0.0' }])
  })

  it('does nothing when a custom registry is configured', async () => {
    const { update } = installApi({
      getSettings: vi.fn(async () => ({ pluginAutoUpdate: true, pluginRegistryUrl: 'https://example.com/r.json' })),
    })
    const onApplied = vi.fn()
    renderHook(() => usePluginAutoUpdate({ onApplied }))

    // Prove the check actually ran (and gated on the custom registry) rather
    // than just not having reached an apply yet.
    await waitFor(() => expect(window.api.getSettings).toHaveBeenCalled())
    expect(update).not.toHaveBeenCalled()
  })

  it('skips a plugin whose pop-out is currently visible', async () => {
    const { update } = installApi({ pluginOverlayVisible: vi.fn(async () => true) })
    const onApplied = vi.fn()
    renderHook(() => usePluginAutoUpdate({ onApplied }))

    // Prove the apply loop ran and reached the pop-out check, then skipped:
    // wait for the visibility query, flush a macrotask so any (incorrect)
    // update call would have fired, and assert it did not.
    await waitFor(() => expect(window.api.pluginOverlayVisible).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 0))
    expect(update).not.toHaveBeenCalled()
  })

  it('re-checks immediately when the opt-in flips on in this window', async () => {
    let enabledNow = false
    const { update } = installApi({
      getSettings: vi.fn(async () => ({ pluginAutoUpdate: enabledNow, pluginRegistryUrl: undefined })),
    })
    const onApplied = vi.fn()
    const { rerender } = renderHook(({ enabled }) => usePluginAutoUpdate({ onApplied, enabled }), {
      initialProps: { enabled: false },
    })

    // Launch check sees it disabled: nothing applied.
    await waitFor(() => expect(window.api.getSettings).toHaveBeenCalled())
    expect(update).not.toHaveBeenCalled()

    // User flips the toggle in this same window: the prop changes.
    enabledNow = true
    rerender({ enabled: true })

    // The prop-change effect re-checks; the overlay is still hidden, so it applies.
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  })
})
