import { Rect } from 'react-konva'
import type Konva from 'konva'
import type { LiveMirrorElement as MirrorEl } from '@shared/whiteboard-types'
import type { GameSize } from '../coords'
import { readAndResetBboxTransform, type BboxTransformResult } from '../tools/transform'

interface Props {
  element: MirrorEl
  size: GameSize
  listening?: boolean
  draggable?: boolean
  onDragEnd?: (delta: { x: number; y: number }) => void
  onTransformEnd?: (next: BboxTransformResult) => void
}

/** The interaction surface for a live mirror. Draws nothing the user reads
 *  except a faint dashed frame while in the select tool; the live pixels come
 *  from the HTML <video> layer behind the canvas (see MirrorLayer). The
 *  near-zero-alpha fill keeps the body on Konva's hit canvas so the whole
 *  rectangle is clickable/draggable, not just the thin stroke. */
export function LiveMirrorElement({
  element,
  size,
  listening = true,
  draggable = false,
  onDragEnd,
  onTransformEnd,
}: Props): JSX.Element {
  const xPx = element.bbox.x * size.w
  const yPx = element.bbox.y * size.h
  const wPx = element.bbox.w * size.w
  const hPx = element.bbox.h * size.h
  return (
    <Rect
      id={element.id}
      x={xPx}
      y={yPx}
      width={wPx}
      height={hPx}
      rotation={(element.rotation * 180) / Math.PI}
      listening={listening}
      draggable={draggable}
      perfectDrawEnabled={false}
      strokeScaleEnabled={false}
      fill="rgba(0,0,0,0.01)"
      stroke={draggable ? 'rgba(56,189,248,0.9)' : undefined}
      strokeWidth={draggable ? 1 : 0}
      dash={draggable ? [6, 4] : undefined}
      onDragEnd={(e) => {
        const node = e.target
        const pos = node.position()
        node.position({ x: xPx, y: yPx })
        if (onDragEnd) onDragEnd({ x: pos.x - xPx, y: pos.y - yPx })
      }}
      onTransformEnd={(e) => {
        const result = readAndResetBboxTransform(e.target as Konva.Node)
        if (onTransformEnd) onTransformEnd(result)
      }}
    />
  )
}
