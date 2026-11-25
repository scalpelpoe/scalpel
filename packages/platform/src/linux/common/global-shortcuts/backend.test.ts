import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetLinuxShortcutBackendForTests,
  getLinuxShortcutBackend,
  setLinuxShortcutBackend,
  toLinuxShortcutBackend,
} from './backend'
import { resolveLinuxShortcutBackend } from './effective'

describe('Linux shortcut backend preference', () => {
  beforeEach(() => {
    __resetLinuxShortcutBackendForTests()
  })

  it('accepts only real shortcut backends', () => {
    expect(toLinuxShortcutBackend('evdev')).toBe('evdev')
    expect(toLinuxShortcutBackend('portal')).toBe('portal')
    expect(toLinuxShortcutBackend('electron')).toBe('electron')
    expect(toLinuxShortcutBackend('xdotool')).toBe('auto')
  })

  it('stores the preference for the next hotkey registration pass', () => {
    setLinuxShortcutBackend('portal')
    expect(getLinuxShortcutBackend()).toBe('portal')

    setLinuxShortcutBackend('nonsense')
    expect(getLinuxShortcutBackend()).toBe('auto')
  })
})

describe('Linux shortcut auto resolution', () => {
  it('uses Electron on X11/XWayland', () => {
    expect(resolveLinuxShortcutBackend('auto', { nativeWayland: false, nativeOverlay: false })).toBe('electron')
  })

  it('uses the portal on native Wayland without a native overlay', () => {
    expect(resolveLinuxShortcutBackend('auto', { nativeWayland: true, nativeOverlay: false })).toBe('portal')
  })

  it('uses the compositor default for Auto when one is configured', () => {
    expect(
      resolveLinuxShortcutBackend('auto', {
        nativeWayland: true,
        nativeOverlay: false,
        defaultBackend: 'evdev',
      }),
    ).toBe('evdev')
  })

  it('uses evdev once a native overlay is available', () => {
    expect(resolveLinuxShortcutBackend('auto', { nativeWayland: true, nativeOverlay: true })).toBe('evdev')
  })

  it('never overrides an explicit choice', () => {
    expect(resolveLinuxShortcutBackend('portal', { nativeWayland: false, nativeOverlay: false })).toBe('portal')
    expect(resolveLinuxShortcutBackend('electron', { nativeWayland: true, nativeOverlay: true })).toBe('electron')
  })
})
