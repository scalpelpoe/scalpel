import { Arrow, Ellipse, Line, Rect } from 'react-konva'
import type Konva from 'konva'
import type { ShapeElement as ShapeEl } from '@shared/whiteboard-types'
import type { GameSize } from '../coords'
import { widthToPixels } from '../coords'
import { readAndResetBboxTransform, type BboxTransformResult } from '../tools/transform'

interface Props {
  element: ShapeEl
  size: GameSize
  listening?: boolean
  draggable?: boolean
  onDragEnd?: (delta: { x: number; y: number }) => void
  onTransformEnd?: (next: BboxTransformResult) => void
}

const ARROW_HEAD_RATIO = 8

export function ShapeElement({
  element,
  size,
  listening = true,
  draggable = false,
  onDragEnd,
  onTransformEnd,
}: Props): JSX.Element | null {
  const stroke = element.stroke
  const fill = element.fill ?? undefined
  const strokeWidth = widthToPixels(element.strokeWidth, size)
  const xPx = element.bbox.x * size.w
  const yPx = element.bbox.y * size.h
  const wPx = element.bbox.w * size.w
  const hPx = element.bbox.h * size.h
  const rotationDeg = (element.rotation * 180) / Math.PI

  // All shape types render with their rotation pivot at the bbox center, so
  // node.position() is always (cx, cy). This unifies the Transformer pivot
  // across shape types and keeps the math in `bakeShapeFromTransformResult`
  // trivially correct (positionPx = new visual center). For Rect, we use
  // offsetX/Y to move the rotation pivot to the center; for Ellipse the
  // origin is naturally the center; for triangle/line/arrow we author the
  // points around (0, 0) and translate to (cx, cy).
  const cx = xPx + wPx / 2
  const cy = yPx + hPx / 2
  const wAbs = Math.abs(wPx)
  const hAbs = Math.abs(hPx)

  const common = {
    id: element.id,
    listening,
    draggable,
    perfectDrawEnabled: false,
    // Borders stay a constant pixel width during scaling - matches FigJam-style
    // behavior. The bake function preserves strokeWidth across transforms so
    // the data and visual agree throughout.
    strokeScaleEnabled: false,
    rotation: rotationDeg,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target
      const pos = node.position()
      node.position({ x: cx, y: cy })
      if (onDragEnd) onDragEnd({ x: pos.x - cx, y: pos.y - cy })
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const result = readAndResetBboxTransform(e.target as Konva.Node)
      if (onTransformEnd) onTransformEnd(result)
    },
  }

  if (element.shape === 'rect') {
    return (
      <Rect
        {...common}
        x={cx}
        y={cy}
        width={wAbs}
        height={hAbs}
        offsetX={wAbs / 2}
        offsetY={hAbs / 2}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={fill}
      />
    )
  }
  if (element.shape === 'ellipse') {
    return (
      <Ellipse
        {...common}
        x={cx}
        y={cy}
        radiusX={wAbs / 2}
        radiusY={hAbs / 2}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={fill}
      />
    )
  }
  if (element.shape === 'triangle') {
    // Points authored relative to the bbox center so rotation pivots there.
    const pts = [0, -hAbs / 2, -wAbs / 2, hAbs / 2, wAbs / 2, hAbs / 2]
    return (
      <Line
        {...common}
        x={cx}
        y={cy}
        points={pts}
        closed={true}
        stroke={stroke}
        strokeWidth={strokeWidth}
        fill={fill}
      />
    )
  }
  if (element.shape === 'line') {
    // Signed wPx/hPx preserves the line's direction. Points span center +/- half-extent.
    const pts = [-wPx / 2, -hPx / 2, wPx / 2, hPx / 2]
    return <Line {...common} x={cx} y={cy} points={pts} stroke={stroke} strokeWidth={strokeWidth} lineCap="round" />
  }
  // arrow
  const pts = [-wPx / 2, -hPx / 2, wPx / 2, hPx / 2]
  return (
    <Arrow
      {...common}
      x={cx}
      y={cy}
      points={pts}
      stroke={stroke}
      fill={stroke}
      strokeWidth={strokeWidth}
      pointerLength={strokeWidth * ARROW_HEAD_RATIO}
      pointerWidth={strokeWidth * ARROW_HEAD_RATIO}
    />
  )
}
