import { Circle } from 'react-konva'
import type { WhiteboardElement } from '../../../../../shared/whiteboard-types'
import type { GameSize } from '../coords'
import { groundToScreen, projectCircle, rightmostPx } from '../poe-projection'

const HANDLE_RADIUS = 7

/** Konva `name`s for the edit handles. Shared so Stage's pointer routing and
 *  the rendered handles can't drift. */
export const DISTANCE_HANDLE = {
  ringRadius: 'distance-handle-ring-radius',
  rulerA: 'distance-handle-ruler-a',
  rulerB: 'distance-handle-ruler-b',
} as const

interface Props {
  element: WhiteboardElement
  size: GameSize
  version: 1 | 2 | null
}

const handleStyle = {
  radius: HANDLE_RADIUS,
  fill: '#ffffff',
  stroke: '#38bdf8',
  strokeWidth: 2,
  perfectDrawEnabled: false,
}

/** Draggable-looking handles for the selected ruler/radiusRing. The Stage owns
 *  the drag logic and routes by node `name`; these are display + hit targets. */
export function DistanceEditHandles({ element, size, version }: Props): JSX.Element | null {
  if (version === null) return null

  if (element.type === 'radiusRing') {
    const ring = projectCircle(version, element.center, element.radius, size)
    const right = rightmostPx(ring, size)
    if (!right) return null
    return <Circle name={DISTANCE_HANDLE.ringRadius} x={right.x} y={right.y} {...handleStyle} />
  }

  if (element.type === 'ruler') {
    const a = groundToScreen(version, element.a, size)
    const b = groundToScreen(version, element.b, size)
    return (
      <>
        {a && <Circle name={DISTANCE_HANDLE.rulerA} x={a.x * size.w} y={a.y * size.h} {...handleStyle} />}
        {b && <Circle name={DISTANCE_HANDLE.rulerB} x={b.x * size.w} y={b.y * size.h} {...handleStyle} />}
      </>
    )
  }

  return null
}
