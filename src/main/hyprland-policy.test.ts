import { describe, expect, it } from 'vitest'
import {
  type HyprClient,
  hyprlandOverlayBounds,
  hyprlandVersionAtLeast,
  isHyprlandGameContext,
} from './hyprland-policy'

const game: HyprClient = {
  address: '0x1',
  pid: 10,
  title: 'Path of Exile 2',
  workspace: { id: 2 },
  at: [0, 0],
  size: [2400, 1350],
  floating: true,
}
describe('Hyprland input ownership', () => {
  it('converts fractional Hyprland scaling to Electron DIP without clipping', () => {
    expect(hyprlandOverlayBounds(game, { x: 0, y: 0, scale: 1.6 }, { bounds: { x: 0, y: 0 }, scaleFactor: 2 })).toEqual(
      {
        dip: { x: 0, y: 0, width: 1920, height: 1080 },
        physical: { x: 0, y: 0, width: 3840, height: 2160 },
      },
    )
  })
  it('allows the focused game', () => expect(isHyprlandGameContext(game, game, 20)).toBe(true))
  it('allows our overlay on the game workspace', () => {
    expect(isHyprlandGameContext({ ...game, address: '0x2', pid: 20, title: 'Scalpel Overlay' }, game, 20)).toBe(true)
  })
  it('rejects our overlay on another workspace', () => {
    expect(
      isHyprlandGameContext(
        { ...game, address: '0x2', pid: 20, title: 'Scalpel Overlay', workspace: { id: 1 } },
        game,
        20,
      ),
    ).toBe(false)
  })
  it('rejects other applications, settings, and missing compositor state', () => {
    expect(isHyprlandGameContext({ ...game, address: '0x3', pid: 30 }, game, 20)).toBe(false)
    expect(isHyprlandGameContext({ ...game, address: '0x3', pid: 20, title: 'Scalpel' }, game, 20)).toBe(false)
    expect(isHyprlandGameContext(null, game, 20)).toBe(false)
    expect(isHyprlandGameContext(game, null, 20)).toBe(false)
  })
})

describe('Hyprland version gate', () => {
  const version = (tag: string) => JSON.stringify({ branch: 'main', tag })
  it('accepts the minimum release and newer', () => {
    expect(hyprlandVersionAtLeast(version('v0.56.0'))).toBe(true)
    expect(hyprlandVersionAtLeast(version('v0.57.1'))).toBe(true)
    expect(hyprlandVersionAtLeast(version('v1.0.0'))).toBe(true)
  })
  it('accepts -git builds of the minimum release', () => {
    expect(hyprlandVersionAtLeast(version('v0.56.0-13-gdeadbee'))).toBe(true)
  })
  it('rejects older releases', () => {
    expect(hyprlandVersionAtLeast(version('v0.55.9'))).toBe(false)
    expect(hyprlandVersionAtLeast(version('v0.9.0'))).toBe(false)
  })
  it('fails closed on output it cannot read', () => {
    expect(hyprlandVersionAtLeast('not json')).toBe(false)
    expect(hyprlandVersionAtLeast(version('unknown'))).toBe(false)
    expect(hyprlandVersionAtLeast('{}')).toBe(false)
  })
})
