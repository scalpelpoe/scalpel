import { describe, expect, it, vi } from 'vitest'
import { pluginHotkeyBinding } from './plugin-hotkey-binding'
import type { RuntimeSettings } from '@shared/types'

function settingsWith(appMacros: Array<{ action: string; hotkey: string }>): RuntimeSettings {
  return { appMacros } as unknown as RuntimeSettings
}

describe('pluginHotkeyBinding', () => {
  it('reports the existing hotkey for the action', () => {
    const { hotkey } = pluginHotkeyBinding({
      action: 'plugin-overlay:demo',
      settings: settingsWith([{ action: 'plugin-overlay:demo', hotkey: 'F8' }]),
      update: vi.fn(),
      tryHotkey: vi.fn(() => true),
    })
    expect(hotkey).toBe('F8')
  })

  it('reports empty string when the action has no entry', () => {
    const { hotkey } = pluginHotkeyBinding({
      action: 'plugin-overlay:demo',
      settings: settingsWith([]),
      update: vi.fn(),
      tryHotkey: vi.fn(() => true),
    })
    expect(hotkey).toBe('')
  })

  it('materializes a new appMacros entry on first bind, checking conflicts at the prospective index', () => {
    const update = vi.fn()
    const tryHotkey = vi.fn(() => true)
    const { setHotkey } = pluginHotkeyBinding({
      action: 'plugin-overlay:demo',
      settings: settingsWith([{ action: 'plugin:other', hotkey: 'F7' }]),
      update,
      tryHotkey,
    })
    setHotkey('F8')
    expect(tryHotkey).toHaveBeenCalledWith('F8', { kind: 'appmacro', index: 1 })
    expect(update).toHaveBeenCalledWith('appMacros', [
      { action: 'plugin:other', hotkey: 'F7' },
      { action: 'plugin-overlay:demo', hotkey: 'F8' },
    ])
  })

  it('edits the existing entry in place when already present', () => {
    const update = vi.fn()
    const { setHotkey } = pluginHotkeyBinding({
      action: 'plugin-overlay:demo',
      settings: settingsWith([{ action: 'plugin-overlay:demo', hotkey: 'F7' }]),
      update,
      tryHotkey: vi.fn(() => true),
    })
    setHotkey('F8')
    expect(update).toHaveBeenCalledWith('appMacros', [{ action: 'plugin-overlay:demo', hotkey: 'F8' }])
  })

  it('clears an existing entry hotkey to empty string on unbind', () => {
    const update = vi.fn()
    const { setHotkey } = pluginHotkeyBinding({
      action: 'plugin-overlay:demo',
      settings: settingsWith([{ action: 'plugin-overlay:demo', hotkey: 'F8' }]),
      update,
      tryHotkey: vi.fn(() => true),
    })
    setHotkey('')
    expect(update).toHaveBeenCalledWith('appMacros', [{ action: 'plugin-overlay:demo', hotkey: '' }])
  })

  it('does not persist when tryHotkey rejects', () => {
    const update = vi.fn()
    const { setHotkey } = pluginHotkeyBinding({
      action: 'plugin-overlay:demo',
      settings: settingsWith([]),
      update,
      tryHotkey: vi.fn(() => false),
    })
    setHotkey('F8')
    expect(update).not.toHaveBeenCalled()
  })

  it('is a no-op when clearing an action that has no entry', () => {
    const update = vi.fn()
    const { setHotkey } = pluginHotkeyBinding({
      action: 'plugin-overlay:demo',
      settings: settingsWith([]),
      update,
      tryHotkey: vi.fn(() => true),
    })
    setHotkey('')
    expect(update).not.toHaveBeenCalled()
  })
})
