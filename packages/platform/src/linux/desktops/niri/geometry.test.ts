import { describe, expect, it } from 'vitest'
import { parseNiriWindowInfo } from './geometry'

const TITLES = ['Path of Exile', 'Path of Exile 2']
const OUTPUTS = JSON.stringify({ 'DP-1': { logical: { x: 0, y: 0 } }, 'DP-2': { logical: { x: 2560, y: 0 } } })
const WORKSPACES = JSON.stringify([
  { id: 2, output: 'DP-1' },
  { id: 3, output: 'DP-2' },
])

function window(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify([
    {
      id: 12,
      title: 'Path of Exile',
      app_id: 'pathofexilesteam.exe',
      workspace_id: 2,
      is_focused: true,
      is_fullscreen: false,
      layout: {
        pos_in_scrolling_layout: [1, 1],
        tile_size: [1704, 957],
        window_size: [1704, 957],
        tile_pos_in_workspace_view: [100, 200],
        window_offset_in_tile: [1, 1],
      },
      ...overrides,
    },
  ])
}

describe('parseNiriWindowInfo', () => {
  it('uses the reported workspace-view position plus output origin', () => {
    const info = parseNiriWindowInfo(window(), OUTPUTS, WORKSPACES, TITLES)
    expect(info).toMatchObject({
      bounds: { x: 101, y: 201, width: 1704, height: 957 },
      mode: null,
      fullscreen: false,
      identity: 'niri:12',
      confidence: 'focused',
    })
  })

  it('adds the output logical offset for windows on a second monitor', () => {
    const info = parseNiriWindowInfo(window({ workspace_id: 3 }), OUTPUTS, WORKSPACES, TITLES)
    expect(info?.bounds.x).toBe(2661)
  })

  it('falls back to the output origin only for a focused tiled window', () => {
    const tiled = {
      pos_in_scrolling_layout: [2, 1],
      tile_size: [1704, 957],
      window_size: [1704, 957],
      tile_pos_in_workspace_view: null,
      window_offset_in_tile: [1, 1],
    }
    const info = parseNiriWindowInfo(window({ layout: tiled }), OUTPUTS, WORKSPACES, TITLES)
    expect(info).toMatchObject({
      bounds: { x: 1, y: 1, width: 1704, height: 957 },
      confidence: 'focused',
    })
    expect(info?.detail).toContain('focused-tile-approx')
    expect(parseNiriWindowInfo(window({ is_focused: false, layout: tiled }), OUTPUTS, WORKSPACES, TITLES)).toBeNull()
  })

  it('rejects launcher windows with a borrowed game title', () => {
    expect(
      parseNiriWindowInfo(window({ app_id: 'steam', title: 'Path of Exile' }), OUTPUTS, WORKSPACES, TITLES),
    ).toBeNull()
  })
})
