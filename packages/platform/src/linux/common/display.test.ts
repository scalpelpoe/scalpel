import { describe, expect, it } from 'vitest'
import {
  effectiveLinuxDisplayMode,
  explicitLinuxDisplayMode,
  isNativeWayland,
  MANAGED_OZONE_ENV,
  ozoneArgsForMode,
  toLinuxDisplayMode,
} from './display'

describe('linux display mode', () => {
  it('falls back to x11 for unknown values', () => {
    expect(toLinuxDisplayMode(undefined)).toBe('x11')
    expect(toLinuxDisplayMode('wayland')).toBe('wayland')
  })

  it('lets an explicit flag override the saved mode', () => {
    expect(effectiveLinuxDisplayMode('x11', ['.'])).toBe('x11')
    expect(effectiveLinuxDisplayMode('x11', ['.', '--ozone-platform=wayland'])).toBe('wayland')
  })

  it('reports an explicit flag separately from the saved mode', () => {
    expect(explicitLinuxDisplayMode(['.'])).toBeUndefined()
    expect(explicitLinuxDisplayMode(['.', '--ozone-platform=wayland'])).toBe('wayland')
    expect(explicitLinuxDisplayMode(['.', '--ozone-platform=x11'])).toBe('x11')
  })

  it('does not report an app-managed bootstrap flag as explicit', () => {
    const args = ['.', '--ozone-platform=wayland']
    expect(explicitLinuxDisplayMode(args, {})).toBe('wayland')
    expect(explicitLinuxDisplayMode(args, { [MANAGED_OZONE_ENV]: '1' })).toBeUndefined()
    // The effective mode must still honor the injected flag.
    expect(effectiveLinuxDisplayMode('x11', args)).toBe('wayland')
  })

  it('reports native Wayland from the launch flag', () => {
    expect(isNativeWayland(['.', '--ozone-platform=wayland'])).toBe(true)
    expect(isNativeWayland(['.', '--ozone-platform=x11'])).toBe(false)
  })

  it('replaces a stale flag when relaunching', () => {
    expect(ozoneArgsForMode(['.', '--ozone-platform=x11'], 'wayland')).toEqual(['.', '--ozone-platform=wayland'])
  })
})
