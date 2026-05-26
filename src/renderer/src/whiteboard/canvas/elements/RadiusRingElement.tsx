import { memo } from 'react'
import { Line } from 'react-konva'
import type { RadiusRingElement as RingEl } from '../../../../../shared/whiteboard-types'
import { widthToPixels, type GameSize } from '../coords'
import { groundToScreen, projectCircle, rightmostPx, unitsToMetres } from '../poe-projection'
import { MetreLabel } from './MetreLabel'

interface Props {
  element: RingEl
  size: GameSize
  version: 1 | 2 | null
  listening?: boolean
}

export const RadiusRingElement = memo(function RadiusRingElement({
  element,
  size,
  version,
  listening = true,
}: Props): JSX.Element | null {
  if (version === null) return null
  const ringNorm = projectCircle(version, element.center, element.radius, size)
  if (ringNorm.length < 3) return null
  const centerNorm = groundToScreen(version, element.center, size)
  if (!centerNorm) return null

  const right = rightmostPx(ringNorm, size)
  if (!right) return null
  const ringPts: number[] = []
  for (const p of ringNorm) ringPts.push(p.x * size.w, p.y * size.h)
  const cx = centerNorm.x * size.w
  const cy = centerNorm.y * size.h
  const metres = unitsToMetres(version, element.radius) ?? element.radius
  const strokePx = widthToPixels(element.strokeWidth, size)

  return (
    <>
      <Line
        id={element.id}
        points={ringPts}
        closed
        stroke={element.stroke}
        strokeWidth={strokePx}
        fill={element.fill ?? undefined}
        hitStrokeWidth={16}
        listening={listening}
        perfectDrawEnabled={false}
      />
      <Line
        points={[cx, cy, right.x, right.y]}
        stroke={element.stroke}
        strokeWidth={strokePx}
        listening={false}
        perfectDrawEnabled={false}
      />
      <MetreLabel
        x={(cx + right.x) / 2}
        y={Math.max(cy, right.y) + 4}
        text={`${metres.toFixed(1)} m`}
        color={element.stroke}
      />
    </>
  )
})
