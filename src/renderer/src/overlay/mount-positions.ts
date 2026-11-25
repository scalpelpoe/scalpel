/** Fixed mount for the regular floating window: no game geometry, so both
 *  docks sit at the same small margin and the sister stays to the right. */
export function windowLocalMountXs(margin: number): { leftMountX: number; rightMountX: number } {
  return { leftMountX: margin, rightMountX: margin }
}

export interface MountGameBounds {
  gameWidth: number
  sidebarWidth: number
}

/**
 * Horizontal dock positions for the main overlay, relative to the game window.
 *
 * The left mount is flush with the game's left edge. Offsetting it by the PoE
 * sidebar width (as the right mount does) parked the panel well inside narrow
 * game windows, which read as "snapped into the middle".
 */
export function overlayMountXs(
  gameBounds: MountGameBounds | null,
  panelWidth: number,
  /** Space needed to the left of the panel for the sister overlay. */
  companionReserve = 0,
): { leftMountX: number; rightMountX: number } {
  if (!gameBounds) return { leftMountX: 0, rightMountX: 0 }
  const ideal = gameBounds.gameWidth - gameBounds.sidebarWidth - panelWidth + 1
  // The sister sits to the left of a right-docked panel; reserve room for it.
  // If the game cannot fit both, keep the main panel inside instead.
  const maxForPanel = Math.max(0, gameBounds.gameWidth - panelWidth)
  const rightMountX = Math.max(0, Math.min(maxForPanel, Math.max(companionReserve, ideal)))
  return {
    leftMountX: 0,
    rightMountX,
  }
}
