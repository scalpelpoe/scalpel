import { describe, expect, it } from 'vitest'
import { overlayMountXs, windowLocalMountXs } from './mount-positions'

describe('overlayMountXs', () => {
  const PANEL_WIDTH = 540

  it('uses the origin before the game attaches', () => {
    expect(overlayMountXs(null, PANEL_WIDTH)).toEqual({ leftMountX: 0, rightMountX: 0 })
  })

  it('docks left flush with the game window', () => {
    expect(overlayMountXs({ gameWidth: 1704, sidebarWidth: 294 }, PANEL_WIDTH)).toEqual({
      leftMountX: 0,
      rightMountX: 871,
    })
  })

  it('keeps a narrow game window from pushing the right mount off-screen', () => {
    expect(overlayMountXs({ gameWidth: 600, sidebarWidth: 294 }, PANEL_WIDTH)).toEqual({
      leftMountX: 0,
      rightMountX: 0,
    })
    // Sway/XWayland tiled PoE at 842x601 reports a ~371px sidebar; a 540px
    // panel would overflow without clamping.
    expect(overlayMountXs({ gameWidth: 842, sidebarWidth: 371 }, PANEL_WIDTH)).toEqual({
      leftMountX: 0,
      rightMountX: 0,
    })
  })

  it('reserves room for the right-docked sister overlay', () => {
    expect(overlayMountXs({ gameWidth: 842, sidebarWidth: 371 }, PANEL_WIDTH, 136)).toEqual({
      leftMountX: 0,
      rightMountX: 136,
    })
    expect(overlayMountXs({ gameWidth: 1704, sidebarWidth: 294 }, PANEL_WIDTH, 136)).toEqual({
      leftMountX: 0,
      rightMountX: 871,
    })
  })

  it('keeps the main panel inside when the game cannot fit both panels', () => {
    expect(overlayMountXs({ gameWidth: 600, sidebarWidth: 294 }, PANEL_WIDTH, 136)).toEqual({
      leftMountX: 0,
      rightMountX: 60,
    })
  })
})

describe('windowLocalMountXs', () => {
  it('uses a fixed margin with no game geometry', () => {
    expect(windowLocalMountXs(8)).toEqual({ leftMountX: 8, rightMountX: 8 })
  })
})
