import { beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetDiagnosticReporterForTests, setBreadcrumbReporter } from '../../common/diagnostics'
import {
  __resetLinuxGameDisplayModeForTests,
  clearLinuxGameDisplayMode,
  getLinuxGameDisplayModeStatus,
  onLinuxGameDisplayModeStatus,
  reportLinuxGameDisplayMode,
  setLinuxGameDisplayModeOverride,
  toLinuxGameDisplayModePreference,
} from './game-display-mode'

describe('Linux game display mode state', () => {
  beforeEach(() => {
    __resetLinuxGameDisplayModeForTests()
    __resetDiagnosticReporterForTests()
  })

  it('normalizes unknown preferences to auto', () => {
    expect(toLinuxGameDisplayModePreference('wayland')).toBe('wayland')
    expect(toLinuxGameDisplayModePreference('detect')).toBe('detect')
    expect(toLinuxGameDisplayModePreference('nonsense')).toBe('auto')
  })

  it('lets a tracker report detection and lets an override win', () => {
    const listener = vi.fn()
    const off = onLinuxGameDisplayModeStatus(listener)

    expect(reportLinuxGameDisplayMode('x11', 'x11-geometry').mode).toBe('x11')
    expect(getLinuxGameDisplayModeStatus()).toMatchObject({
      detected: 'x11',
      source: 'x11-geometry',
      override: 'auto',
    })

    setLinuxGameDisplayModeOverride('wayland')
    expect(getLinuxGameDisplayModeStatus().mode).toBe('wayland')
    expect(listener).toHaveBeenCalledTimes(2)

    off()
    clearLinuxGameDisplayMode()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('does not publish an unchanged detection', () => {
    const listener = vi.fn()
    const off = onLinuxGameDisplayModeStatus(listener)
    reportLinuxGameDisplayMode('wayland', 'umbriel')
    reportLinuxGameDisplayMode('wayland', 'umbriel')
    expect(listener).toHaveBeenCalledOnce()
    off()
  })

  it('breadcrumbs only when the detected game mode or source changes', () => {
    const breadcrumb = vi.fn()
    setBreadcrumbReporter(breadcrumb)

    reportLinuxGameDisplayMode('x11', 'x11-geometry')
    expect(breadcrumb).toHaveBeenCalledWith('game window mode=x11 source=x11-geometry', 'debug')
    breadcrumb.mockClear()

    reportLinuxGameDisplayMode('x11', 'x11-geometry')
    expect(breadcrumb).not.toHaveBeenCalled()

    reportLinuxGameDisplayMode('wayland', 'sway')
    expect(breadcrumb).toHaveBeenCalledWith('game window mode=wayland source=sway', 'debug')
  })
})
