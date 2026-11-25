import { describe, expect, it } from 'vitest'
import { createUmbrielGeometryProvider, parseUmbrielWindowInfo } from './geometry'

describe('parseUmbrielWindowInfo', () => {
  it('uses the shared matcher for a PoE2 native Wayland window', () => {
    const json = JSON.stringify([
      {
        id: '88856fc10860c442237ba917a8dc086f',
        title: 'Path of Exile 2',
        app_id: 'pathofexilesteam.exe',
        x: 10,
        y: 20,
        w: 1920,
        h: 1080,
        xwayland: false,
        output: 'DP-2',
      },
    ])
    const info = parseUmbrielWindowInfo(json, ['Path of Exile', 'Path of Exile 2'])
    expect(info).toMatchObject({
      bounds: { x: 10, y: 20, width: 1920, height: 1080 },
      mode: 'wayland',
      identity: 'umbriel:88856fc10860c442237ba917a8dc086f',
      identityScore: 5,
    })
    expect(info?.detail).toContain('gameMode=wayland')
    expect(info?.detail).toContain('variant=2')
  })

  it('rejects a launcher window that borrowed the game title', () => {
    const json = JSON.stringify([
      { id: 'steam-properties', title: 'Path of Exile 2', app_id: 'steam', x: 10, y: 20, w: 850, h: 601 },
    ])
    expect(parseUmbrielWindowInfo(json, ['Path of Exile 2'])).toBeNull()
  })
})

describe('createUmbrielGeometryProvider', () => {
  it('runs before the title-only X11 geometry hook', () => {
    const provider = createUmbrielGeometryProvider()
    expect(provider.phase).toBe('preferred')
    expect(provider.reportSource).toBe('umbriel')
  })
})
