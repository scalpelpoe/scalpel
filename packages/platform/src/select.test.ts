import { beforeEach, describe, expect, it, vi } from 'vitest'
import { relaunchArgs, selectBackend } from './select'
import type { PlatformEnv } from './types'

const env = (platform: NodeJS.Platform, vars: Record<string, string> = {}): PlatformEnv => ({
  platform,
  env: vars,
  argv: ['scalpel'],
})
const hyprland = env('linux', { HYPRLAND_INSTANCE_SIGNATURE: 'abc' })

describe('selectBackend', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it.each([
    ['win32', 'windows'],
    ['darwin', 'macos'],
    ['linux', 'x11'],
  ] as const)('maps %s to the %s backend without querying a compositor', (platform, id) => {
    const version = vi.fn(() => '{"tag":"v0.56.0"}')
    expect(selectBackend(env(platform), version)).toBe(id)
    expect(version).not.toHaveBeenCalled()
  })

  it('keeps the X11 tracker on Windows even when a Hyprland variable leaks in', () => {
    expect(selectBackend(env('win32', { HYPRLAND_INSTANCE_SIGNATURE: 'abc' }), () => '')).toBe('windows')
  })

  it('selects Hyprland from the supported release on, including -git builds', () => {
    expect(selectBackend(hyprland, () => '{"tag":"v0.56.0"}')).toBe('hyprland')
    expect(selectBackend(hyprland, () => '{"tag":"v0.57.1-13-gdeadbee"}')).toBe('hyprland')
  })

  it('falls back to X11 on an older Hyprland', () => {
    expect(selectBackend(hyprland, () => '{"tag":"v0.55.2"}')).toBe('x11')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('older than 0.56.0'))
  })

  it('fails closed to X11 when the version is unreadable or the query fails', () => {
    expect(selectBackend(hyprland, () => 'not json')).toBe('x11')
    expect(
      selectBackend(hyprland, () => {
        throw new Error('hyprctl: command not found')
      }),
    ).toBe('x11')
  })
})

describe('relaunchArgs', () => {
  const wayland = (argv: string[]): PlatformEnv => ({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-1' }, argv })

  it('relaunches a Wayland session under XWayland, keeping the original arguments', () => {
    expect(relaunchArgs(wayland(['/opt/scalpel', '--no-sandbox']))).toEqual(['--no-sandbox', '--ozone-platform=x11'])
  })

  it('respects an explicitly chosen Ozone platform', () => {
    expect(relaunchArgs(wayland(['/opt/scalpel', '--ozone-platform=wayland']))).toBeNull()
  })

  it('keeps X11 sessions and other systems as they are', () => {
    expect(relaunchArgs(env('linux'))).toBeNull()
    expect(relaunchArgs(env('win32', { WAYLAND_DISPLAY: 'wayland-1' }))).toBeNull()
  })
})
