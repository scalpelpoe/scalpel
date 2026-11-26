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
  const facts = { nativeWayland: true, nativeOverlay: false, evdevReadable: true }

  it('uses Electron on X11/XWayland', () => {
    expect(resolveLinuxShortcutBackend('auto', { ...facts, nativeWayland: false })).toBe('electron')
  })

  it('uses the portal on native Wayland without a native overlay', () => {
    expect(resolveLinuxShortcutBackend('auto', facts)).toBe('portal')
  })

  it('uses the compositor default for Auto when one is configured', () => {
    expect(resolveLinuxShortcutBackend('auto', { ...facts, defaultBackend: 'evdev' })).toBe('evdev')
  })

  it('uses evdev once a native overlay is available', () => {
    expect(resolveLinuxShortcutBackend('auto', { ...facts, nativeOverlay: true })).toBe('evdev')
  })

  it('falls back to the portal when no keyboard is readable', () => {
    const unreadable = { ...facts, evdevReadable: false }
    expect(resolveLinuxShortcutBackend('auto', { ...unreadable, nativeOverlay: true })).toBe('portal')
    expect(resolveLinuxShortcutBackend('auto', { ...unreadable, defaultBackend: 'evdev' })).toBe('portal')
  })

  it('never overrides an explicit choice', () => {
    expect(resolveLinuxShortcutBackend('portal', { ...facts, nativeWayland: false })).toBe('portal')
    expect(resolveLinuxShortcutBackend('evdev', { ...facts, evdevReadable: false })).toBe('evdev')
  })
})
