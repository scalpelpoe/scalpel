import { Line } from 'react-konva'
import type Konva from 'konva'
import type { StrokeElement as StrokeEl } from '@shared/whiteboard-types'
import type { GameSize } from '../coords'
import { widthToPixels } from '../coords'
import type { StrokeTransformResult } from '../tools/transform'

interface Props {
  element: StrokeEl
  size: GameSize
  /** When true, this Line is hit-testable. The in-progress layer passes false
   *  so the user can't accidentally click their own active stroke. */
  listening?: boolean
  draggable?: boolean
  onDragEnd?: (delta: { x: number; y: number }) => void
  onTransformEnd?: (next: StrokeTransformResult) => void
}

export function StrokeElement({
  element,
  size,
  listening = true,
  draggable = false,
  onDragEnd,
  onTransformEnd,
}: Props): JSX.Element {
  const flat: number[] = new Array(element.points.length * 2)
  for (let i = 0; i < element.points.length; i++) {
    flat[i * 2] = element.points[i].x * size.w
    flat[i * 2 + 1] = element.points[i].y * size.h
  }
  const isHi = element.variant === 'highlighter'
  return (
    <Line
      id={element.id}
      points={flat}
      stroke={element.color}
      strokeWidth={widthToPixels(element.width, size)}
      tension={0.6}
      lineCap={isHi ? 'butt' : 'round'}
      lineJoin="round"
      opacity={isHi ? 0.35 : 1}
      listening={listening}
      perfectDrawEnabled={false}
      // Pen/highlighter width stays constant when the stroke is selected and
      // scaled. The bake preserves the stored width to match.
      strokeScaleEnabled={false}
      draggable={draggable}
      onDragEnd={(e) => {
        const node = e.target
        const pos = node.position()
        node.position({ x: 0, y: 0 })
        if (onDragEnd) onDragEnd(pos)
      }}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Line
        // Read the node's full absolute transform (translation + rotation + scale)
        // and bake it into the points so the stored data reflects the final
        // visual position. This keeps the on-disk model invariant across
        // any combination of move/rotate/scale.
        const transform = node.getAbsoluteTransform().copy()
        const local = node.points()
        const baked: number[] = new Array(local.length)
        for (let i = 0; i < local.length; i += 2) {
          const t = transform.point({ x: local[i], y: local[i + 1] })
          baked[i] = t.x
          baked[i + 1] = t.y
        }
        // Reset the node's transform so the next render renders the baked
        // points cleanly without double-applying.
        node.position({ x: 0, y: 0 })
        node.rotation(0)
        node.scaleX(1)
        node.scaleY(1)
        if (onTransformEnd) onTransformEnd({ pointsPx: baked })
      }}
    />
  )
}
