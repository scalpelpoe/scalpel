import { Text as KonvaText } from 'react-konva'
import type Konva from 'konva'
import type { TextElement as TextEl } from '@shared/whiteboard-types'
import type { GameSize } from '../coords'
import { readAndResetBboxTransform, type BboxTransformResult } from '../tools/transform'

interface Props {
  element: TextEl
  size: GameSize
  visible?: boolean
  listening?: boolean
  draggable?: boolean
  onDragEnd?: (delta: { x: number; y: number }) => void
  onTransformEnd?: (next: BboxTransformResult) => void
  onDoubleClick?: () => void
}

export function TextElement({
  element,
  size,
  visible = true,
  listening = true,
  draggable = false,
  onDragEnd,
  onTransformEnd,
  onDoubleClick,
}: Props): JSX.Element {
  const xPx = element.bbox.x * size.w
  const yPx = element.bbox.y * size.h
  const wPx = element.bbox.w * size.w
  const fontSizePx = element.fontSize * size.h
  const rotationDeg = (element.rotation * 180) / Math.PI

  return (
    <KonvaText
      id={element.id}
      x={xPx}
      y={yPx}
      width={wPx}
      text={element.text}
      fontSize={fontSizePx}
      fontStyle={`${element.fontWeight}`}
      fontFamily="'Segoe UI', system-ui"
      lineHeight={1.2}
      fill={element.color}
      rotation={rotationDeg}
      visible={visible}
      listening={listening}
      draggable={draggable}
      perfectDrawEnabled={false}
      onDblClick={() => onDoubleClick?.()}
      onDblTap={() => onDoubleClick?.()}
      onDragEnd={(e) => {
        const node = e.target
        const pos = node.position()
        // Konva.Text drag updates the node's x/y absolute origin. The shift
        // we want is delta from the element's stored bbox.x/y.
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
