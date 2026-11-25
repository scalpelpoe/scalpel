import { describe, expect, it } from 'vitest'
import { parseSwayTree } from './geometry'

const tree = (nodes: unknown[]): string => JSON.stringify({ id: 1, type: 'root', nodes })
const both = ['Path of Exile', 'Path of Exile 2']

describe('parseSwayTree', () => {
  it('uses Sway rects directly as logical bounds for a fullscreen game', () => {
    const info = parseSwayTree(
      tree([
        {
          id: 10,
          type: 'output',
          name: 'DP-1',
          nodes: [
            {
              id: 110,
              type: 'con',
              name: 'Path of Exile',
              app_id: 'pathofexilesteam.exe',
              rect: { x: -1707, y: -480, width: 1706, height: 1920 },
              fullscreen_mode: 1,
              shell: 'xdg_shell',
              visible: true,
              focused: true,
            },
          ],
        },
      ]),
      ['Path of Exile'],
    )

    expect(info).toMatchObject({
      bounds: { x: -1707, y: -480, width: 1706, height: 1920 },
      logical: true,
      mode: 'wayland',
      fullscreen: true,
      outputs: ['DP-1'],
      identity: 'sway:110',
      confidence: 'focused',
      identityScore: 5,
    })
  })

  it('combines window_rect offsets for a windowed XWayland game', () => {
    const info = parseSwayTree(
      tree([
        {
          id: 111,
          type: 'con',
          name: 'Path of Exile 2',
          rect: { x: 300, y: 200, width: 900, height: 700 },
          window_rect: { x: 10, y: 30, width: 880, height: 640 },
          shell: 'xwayland',
          visible: true,
        },
      ]),
      ['Path of Exile 2'],
    )

    expect(info?.bounds).toEqual({ x: 310, y: 230, width: 880, height: 640 })
    expect(info?.mode).toBe('x11')
    expect(info?.detail).toContain('gameMode=x11')
    expect(info?.fullscreen).toBe(false)
  })

  it('resolves the shared Steam executable to PoE2 from its native Wayland title', () => {
    const info = parseSwayTree(
      tree([
        {
          id: 180,
          type: 'con',
          name: 'Path of Exile 2',
          app_id: 'pathofexilesteam.exe',
          rect: { x: 0, y: 0, width: 2560, height: 1440 },
          shell: 'xdg_shell',
          visible: true,
          focused: true,
          fullscreen_mode: 1,
        },
      ]),
      both,
    )

    expect(info).toMatchObject({ mode: 'wayland', identityScore: 5, identity: 'sway:180' })
    expect(info?.detail).toContain('gameMode=wayland')
    expect(info?.detail).toContain('variant=2')
  })

  it('matches the window title case-insensitively', () => {
    const info = parseSwayTree(
      tree([
        {
          id: 112,
          type: 'con',
          window_properties: { title: 'PATH OF EXILE' },
          rect: { x: 0, y: 0, width: 1920, height: 1080 },
          shell: 'xdg_shell',
        },
      ]),
      ['Path of Exile'],
    )

    expect(info?.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('prefers a visible node over a stale hidden match', () => {
    const stale = {
      id: 1,
      type: 'con',
      name: 'Path of Exile',
      visible: false,
      rect: { x: 0, y: 0, width: 1, height: 1 },
    }
    const visible = {
      id: 2,
      type: 'con',
      name: 'Path of Exile',
      visible: true,
      rect: { x: 50, y: 60, width: 800, height: 600 },
    }
    expect(parseSwayTree(tree([stale, visible]), ['Path of Exile'])?.bounds).toEqual({
      x: 50,
      y: 60,
      width: 800,
      height: 600,
    })
  })

  it('keeps a preferred identity even when another matching node is focused', () => {
    const windowed = {
      id: 72,
      type: 'floating_con',
      name: 'Path of Exile',
      rect: { x: 2661, y: 579, width: 842, height: 601 },
      visible: true,
      shell: 'xwayland',
    }
    const fullscreen = {
      id: 110,
      type: 'con',
      name: 'Path of Exile',
      rect: { x: 0, y: 0, width: 2560, height: 1440 },
      visible: true,
      focused: true,
      fullscreen_mode: 1,
      shell: 'xdg_shell',
    }
    expect(parseSwayTree(tree([fullscreen, windowed]), ['Path of Exile'], 'sway:72')).toMatchObject({
      identity: 'sway:72',
      bounds: { x: 2661, y: 579, width: 842, height: 601 },
    })
  })

  it('ignores a focused Steam client window that borrowed the game title', () => {
    const steam = {
      id: 72,
      type: 'floating_con',
      name: 'Path of Exile',
      app_id: 'steam.exe',
      visible: true,
      focused: true,
      rect: { x: 2661, y: 579, width: 842, height: 601 },
    }
    const game = {
      id: 110,
      type: 'con',
      name: 'Path of Exile',
      app_id: 'pathofexilesteam.exe',
      visible: false,
      rect: { x: 0, y: 0, width: 2560, height: 1440 },
    }
    expect(parseSwayTree(tree([steam, game]), ['Path of Exile'])).toMatchObject({
      identity: 'sway:110',
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    })
  })

  it('prefers a focused native PoE2 Steam game over a stale PoE1 window', () => {
    const stalePoe1 = {
      id: 110,
      type: 'con',
      name: 'Path of Exile',
      app_id: 'pathofexilesteam.exe',
      shell: 'xdg_shell',
      visible: false,
      rect: { x: 0, y: 0, width: 2560, height: 1440 },
    }
    const poe2 = {
      id: 19,
      type: 'con',
      name: 'Path of Exile 2',
      app_id: 'steam_app_2694490',
      shell: 'xdg_shell',
      visible: true,
      focused: true,
      rect: { x: 1281, y: 1, width: 1278, height: 968 },
    }
    expect(parseSwayTree(tree([stalePoe1, poe2]), ['Path of Exile', 'Path of Exile 2'])).toMatchObject({
      identity: 'sway:19',
      bounds: { x: 1281, y: 1, width: 1278, height: 968 },
      confidence: 'focused',
      identityScore: 5,
    })
  })

  it('never returns PoE2 to a PoE1 profile', () => {
    const poe2 = {
      id: 9,
      type: 'con',
      name: 'Path of Exile 2',
      app_id: 'com.poe.game',
      rect: { x: 0, y: 0, width: 1920, height: 1080 },
    }
    expect(parseSwayTree(tree([poe2]), ['Path of Exile'])).toBeNull()
    expect(parseSwayTree(tree([poe2]), ['Path of Exile 2'])?.identity).toBe('sway:9')
  })

  it('returns null for invalid JSON and invalid rects', () => {
    expect(parseSwayTree('not json', ['Path of Exile'])).toBeNull()
    expect(
      parseSwayTree(
        tree([
          {
            id: 3,
            type: 'con',
            name: 'Path of Exile',
            rect: { x: 0, y: 0, width: 0, height: 600 },
          },
        ]),
        ['Path of Exile'],
      ),
    ).toBeNull()
  })
})
