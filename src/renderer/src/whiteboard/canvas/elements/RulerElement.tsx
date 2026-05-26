import { memo } from 'react'
import { Line } from 'react-konva'
import type { RulerElement as RulerEl } from '../../../../../shared/whiteboard-types'
import { widthToPixels, type GameSize } from '../coords'
import { groundDistance, groundToScreen, unitsToMetres } from '../poe-projection'
import { MetreLabel } from './MetreLabel'

interface Props {
  element: RulerEl
  size: GameSize
  version: 1 | 2 | null
  listening?: boolean
}

export const RulerElement = memo(function RulerElement({
  element,
  size,
  version,
  listening = true,
}: Props): JSX.Element | null {
  if (version === null) return null
  const aN = groundToScreen(version, element.a, size)
  const bN = groundToScreen(version, element.b, size)
  if (!aN || !bN) return null

  const ax = aN.x * size.w
  const ay = aN.y * size.h
  const bx = bN.x * size.w
  const by = bN.y * size.h
  const metres = unitsToMetres(version, groundDistance(element.a, element.b)) ?? 0
  const strokePx = widthToPixels(element.strokeWidth, size)

  return (
    <>
      <Line
        id={element.id}
        points={[ax, ay, bx, by]}
        stroke={element.stroke}
        strokeWidth={strokePx}
        lineCap="round"
        hitStrokeWidth={16}
        listening={listening}
        perfectDrawEnabled={false}
      />
      <MetreLabel x={(ax + bx) / 2} y={(ay + by) / 2 - 20} text={`${metres.toFixed(1)} m`} color={element.stroke} />
    </>
  )
})
