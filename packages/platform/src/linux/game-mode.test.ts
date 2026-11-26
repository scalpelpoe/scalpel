import { describe, expect, it } from 'vitest'
import type { PlatformEnv } from '../types'
import { detectPlatformGameMode, gameModeFromClients } from './game-mode'
import type { HyprClient } from './desktops/hyprland/policy'

const client = (title: string, xwayland?: boolean): HyprClient => ({
  address: '0x1',
  pid: 1,
  title,
  workspace: { id: 1 },
  at: [0, 0],
  size: [1, 1],
  floating: true,
  ...(xwayland === undefined ? {} : { xwayland }),
})

const env = (platform: NodeJS.Platform, vars: Record<string, string> = {}): PlatformEnv => ({
  platform,
  env: vars,
  argv: ['scalpel'],
})

describe('gameModeFromClients', () => {
  it('reads the native-Wayland flag from a matching game window', () => {
    const clients = [client('Other'), client('Path of Exile', false)]
    expect(gameModeFromClients(clients, ['Path of Exile'])).toBe('wayland')
  })

  it('treats an XWayland game as X11 and stays null without metadata', () => {
    expect(gameModeFromClients([client('Path of Exile', true)], ['Path of Exile'])).toBe('x11')
    expect(gameModeFromClients([client('Path of Exile')], ['Path of Exile'])).toBeNull()
    expect(gameModeFromClients([client('Other', false)], ['Path of Exile'])).toBeNull()
  })
})

describe('detectPlatformGameMode', () => {
  it('returns null outside a Hyprland session without probing', () => {
    const read = () => {
      throw new Error('should not run')
    }
    expect(detectPlatformGameMode(['Path of Exile'], read, env('win32'))).toBeNull()
    expect(detectPlatformGameMode(['Path of Exile'], read, env('linux'))).toBeNull()
  })

  it('uses the injected compositor reader and fails closed', () => {
    const session = env('linux', { HYPRLAND_INSTANCE_SIGNATURE: 'abc' })
    expect(detectPlatformGameMode(['Path of Exile'], () => [client('Path of Exile', false)], session)).toBe('wayland')
    expect(
      detectPlatformGameMode(
        ['Path of Exile'],
        () => {
          throw new Error('hyprctl missing')
        },
        session,
      ),
    ).toBeNull()
  })
})
