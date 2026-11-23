/** Map positions relative to an origin, rather than scaling desktop-global
 * coordinates. This also works for mixed-DPI monitors left of the primary. */
export function mapPointBetweenRects(
  point: { x: number; y: number },
  from: { x: number; y: number; width: number; height: number },
  to: { x: number; y: number; width: number; height: number },
): { x: number; y: number } | null {
  if (
    ![point.x, point.y, ...Object.values(from), ...Object.values(to)].every(Number.isFinite) ||
    from.width <= 0 ||
    from.height <= 0 ||
    to.width <= 0 ||
    to.height <= 0
  )
    return null
  return {
    x: to.x + ((point.x - from.x) * to.width) / from.width,
    y: to.y + ((point.y - from.y) * to.height) / from.height,
  }
}
