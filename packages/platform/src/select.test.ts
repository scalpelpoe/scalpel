import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetRuntimeDesktopCacheForTests,
  detectDesktopEnvironment,
  detectRuntimeDesktop,
  detectOperatingSystem,
  probeRuntimeDesktop,
  relaunchArgs,
  selectBackend,
  type RuntimeDesktopProbe,
} from './select'
import type { PlatformEnv } from './types'

const env = (platform: NodeJS.Platform, vars: Record<string, string> = {}): PlatformEnv => ({
  platform,
  env: vars,
  argv: ['scalpel'],
})

const probed = (vars: Record<string, string>, runtimeDesktop: PlatformEnv['runtimeDesktop']): PlatformEnv => ({
  ...env('linux', vars),
  runtimeDesktop,
})

const fakeProbe = (found: Partial<Record<'niri' | 'sway' | 'hyprland' | 'umbriel', boolean>>): RuntimeDesktopProbe => ({
  socket: (kind) => found[kind] === true,
  umbrielRunning: () => found.umbriel === true,
})
const hyprland = env('linux', { HYPRLAND_INSTANCE_SIGNATURE: 'abc' })

describe('detectOperatingSystem', () => {
  it.each([
    ['win32', 'windows'],
    ['darwin', 'macos'],
    ['linux', 'linux'],
    ['freebsd', 'unknown'],
  ] as const)('maps %s to %s', (platform, os) => {
    expect(detectOperatingSystem(env(platform))).toBe(os)
  })
})

describe('detectDesktopEnvironment', () => {
  it('prefers the compositor signature over the desktop name', () => {
    expect(
      detectDesktopEnvironment(env('linux', { HYPRLAND_INSTANCE_SIGNATURE: 'abc', XDG_CURRENT_DESKTOP: 'KDE' })),
    ).toBe('hyprland')
  })

  it.each([
    ['KDE', 'kde'],
    ['niri', 'niri'],
    ['sway', 'sway'],
    ['umbriel', 'umbriel'],
    ['GNOME', 'gnome'],
    ['XFCE', 'xfce'],
  ] as const)('reads %s from XDG_CURRENT_DESKTOP', (desktop, detected) => {
    expect(detectDesktopEnvironment(env('linux', { XDG_CURRENT_DESKTOP: desktop }))).toBe(detected)
  })

  it('prefers compositor sockets over the desktop name', () => {
    expect(detectDesktopEnvironment(env('linux', { NIRI_SOCKET: '/run/niri.sock', XDG_CURRENT_DESKTOP: 'KDE' }))).toBe(
      'niri',
    )
    expect(detectDesktopEnvironment(env('linux', { SWAYSOCK: '/run/sway.sock', XDG_CURRENT_DESKTOP: 'GNOME' }))).toBe(
      'sway',
    )
  })

  it('prefers runtime-proof desktops over a missing or generic name', () => {
    expect(detectDesktopEnvironment(probed({}, 'sway'))).toBe('sway')
    expect(detectDesktopEnvironment(probed({ XDG_CURRENT_DESKTOP: 'GNOME' }, 'niri'))).toBe('niri')
    expect(detectDesktopEnvironment(probed({ XDG_CURRENT_DESKTOP: 'Generic' }, null))).toBe('unknown')
  })

  it('reads session-name fallbacks when XDG_CURRENT_DESKTOP is empty', () => {
    expect(detectDesktopEnvironment(env('linux', { DESKTOP_SESSION: 'niri-uwsm' }))).toBe('niri')
    expect(detectDesktopEnvironment(env('linux', { XDG_SESSION_DESKTOP: 'niri-session' }))).toBe('niri')
    expect(detectDesktopEnvironment(env('linux', { XDG_SESSION_DESKTOP: 'plasma' }))).toBe('kde')
    expect(detectDesktopEnvironment(env('linux', { KDE_FULL_SESSION: 'true' }))).toBe('kde')
  })

  it('falls back to the session type, then to unknown', () => {
    expect(detectDesktopEnvironment(env('linux', { WAYLAND_DISPLAY: 'wayland-1' }))).toBe('wayland')
    expect(detectDesktopEnvironment(env('linux', { DISPLAY: ':0' }))).toBe('x11')
    expect(detectDesktopEnvironment(env('linux'))).toBe('unknown')
  })

  it('never reports a desktop on a non-Linux OS', () => {
    expect(detectDesktopEnvironment(env('win32', { WAYLAND_DISPLAY: 'wayland-1' }))).toBe('unknown')
  })
})

describe('probeRuntimeDesktop', () => {
  it('uses the compositor socket, in a stable order', () => {
    expect(probeRuntimeDesktop({}, fakeProbe({ niri: true, sway: true, umbriel: true }))).toBe('niri')
    expect(probeRuntimeDesktop({}, fakeProbe({ sway: true }))).toBe('sway')
    expect(probeRuntimeDesktop({}, fakeProbe({ hyprland: true }))).toBe('hyprland')
  })

  it('accepts the Umbriel CLI only when no other compositor proof exists', () => {
    expect(probeRuntimeDesktop({}, fakeProbe({ umbriel: true }))).toBe('umbriel')
    expect(probeRuntimeDesktop({}, fakeProbe({ hyprland: true, umbriel: true }))).toBe('hyprland')
    expect(probeRuntimeDesktop({}, fakeProbe({}))).toBeNull()
  })
})

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
  const wayland = (argv: string[], vars: Record<string, string> = { WAYLAND_DISPLAY: 'wayland-1' }): PlatformEnv => ({
    platform: 'linux',
    env: vars,
    argv,
  })

  it('defaults a Wayland session to XWayland, keeping the original arguments', () => {
    expect(relaunchArgs(wayland(['/opt/scalpel', '--no-sandbox']))).toEqual(['--no-sandbox', '--ozone-platform=x11'])
  })

  it('honours a saved Wayland preference', () => {
    expect(relaunchArgs(wayland(['/opt/scalpel', '--no-sandbox']), 'wayland')).toEqual([
      '--no-sandbox',
      '--ozone-platform=wayland',
    ])
  })

  it('replaces only the managed flag when the saved mode changes', () => {
    const current = wayland(['/opt/scalpel', '--no-sandbox', '--ozone-platform=x11'], {
      WAYLAND_DISPLAY: 'wayland-1',
      SCALPEL_MANAGED_OZONE: '1',
    })
    expect(relaunchArgs(current, 'wayland')).toEqual(['--no-sandbox', '--ozone-platform=wayland'])
  })

  it('does not relaunch when the managed flag already matches', () => {
    const current = wayland(['/opt/scalpel', '--ozone-platform=x11'], {
      WAYLAND_DISPLAY: 'wayland-1',
      SCALPEL_MANAGED_OZONE: '1',
    })
    expect(relaunchArgs(current, 'x11')).toBeNull()
  })

  it('respects an explicitly chosen Ozone platform', () => {
    expect(relaunchArgs(wayland(['/opt/scalpel', '--ozone-platform=wayland']), 'x11')).toBeNull()
  })

  it('keeps X11 sessions and other systems as they are', () => {
    expect(relaunchArgs(env('linux'))).toBeNull()
    expect(relaunchArgs(env('win32', { WAYLAND_DISPLAY: 'wayland-1' }))).toBeNull()
  })
})

describe('detectRuntimeDesktop', () => {
  let runtimeDir: string

  beforeEach(() => {
    __resetRuntimeDesktopCacheForTests()
    runtimeDir = mkdtempSync(join(tmpdir(), 'scalpel-runtime-'))
  })
  afterEach(() => {
    rmSync(runtimeDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
  })

  it('accepts a compositor socket whose PID is alive', () => {
    writeFileSync(join(runtimeDir, `sway-ipc.1000.${process.pid}.sock`), '')
    expect(detectRuntimeDesktop({ XDG_RUNTIME_DIR: runtimeDir })).toBe('sway')
  })

  it('ignores a socket left behind by a dead compositor', () => {
    writeFileSync(join(runtimeDir, 'sway-ipc.1000.999999999.sock'), '')
    writeFileSync(join(runtimeDir, 'niri.wayland-1.999999999.sock'), '')
    expect(detectRuntimeDesktop({ XDG_RUNTIME_DIR: runtimeDir })).toBeNull()
  })

  it('never probes off Linux', () => {
    vi.stubGlobal('process', { ...process, platform: 'win32' })
    writeFileSync(join(runtimeDir, `sway-ipc.1000.${process.pid}.sock`), '')
    expect(detectRuntimeDesktop({ XDG_RUNTIME_DIR: runtimeDir })).toBeNull()
  })
})
