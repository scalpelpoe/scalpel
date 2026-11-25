import { expect, it } from 'vitest'
import { mapPointBetweenRects } from './coordinates'

it('round-trips the radial open point across fractional scaling and a negative monitor origin', () => {
  const compositor = { x: -2400, y: 100, width: 2400, height: 1350 }
  const dip = { x: -1920, y: 80, width: 1920, height: 1080 }
  const point = { x: -1800, y: 775 }
  expect(mapPointBetweenRects(point, compositor, dip)).toEqual({ x: -1440, y: 620 })
  expect(mapPointBetweenRects({ x: -1440, y: 620 }, dip, compositor)).toEqual(point)
})
it('rejects invalid coordinates and detached game geometry', () => {
  const rect = { x: 0, y: 0, width: 1920, height: 1080 }
  expect(mapPointBetweenRects({ x: NaN, y: 0 }, rect, rect)).toBeNull()
  expect(mapPointBetweenRects({ x: 0, y: 0 }, { ...rect, width: 0 }, rect)).toBeNull()
})
