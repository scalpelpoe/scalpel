import { useRef } from 'react'
import { Group, Label, Rect, Tag, Text } from 'react-konva'
import type Konva from 'konva'
import type { LiveMirrorElement as MirrorEl } from '@shared/whiteboard-types'
import type { GameSize } from '../coords'
import { readAndResetBboxTransform, type BboxTransformResult } from '../tools/transform'

/** Konva id of the ghost rect, so Stage can bind a Transformer to it and route
 *  pointer events around it. */
export const SOURCE_GHOST_ID = 'source-ghost'

/** Gap (px) between the ghost's top edge and the "Capture" pill above it. */
const LABEL_OFFSET_Y = 22

interface Props {
  element: MirrorEl
  size: GameSize
  onMove: (delta: { x: number; y: number }) => void
  onResize: (next: BboxTransformResult) => void
}

/** Edit-mode overlay marking what a selected live mirror captures: an amber
 *  dashed box (distinct from the blue dest selection frame) over the game at
 *  the source rect. Draggable to move the capture; corner-resized via the ghost
 *  Transformer in Stage. */
export function SourceGhost({ element, size, onMove, onResize }: Props): JSX.Element {
  const xPx = element.source.x * size.w
  const yPx = element.source.y * size.h
  const wPx = element.source.w * size.w
  const hPx = element.source.h * size.h
  const labelRef = useRef<Konva.Label>(null)
  // Pin the pill to the box's live top-left during drag/resize. The resting
  // position comes from props (committed source); these keep it from lagging
  // behind the node and snapping back only on release.
  const pinLabel = (node: Konva.Node): void => {
    labelRef.current?.position({ x: node.x(), y: node.y() - LABEL_OFFSET_Y })
  }
  return (
    <Group>
      <Rect
        id={SOURCE_GHOST_ID}
        x={xPx}
        y={yPx}
        width={wPx}
        height={hPx}
        rotation={0}
        draggable
        perfectDrawEnabled={false}
        strokeScaleEnabled={false}
        fill="rgba(251,191,36,0.08)"
        stroke="rgba(251,191,36,0.95)"
        strokeWidth={2}
        dash={[6, 4]}
        onDragMove={(e) => pinLabel(e.target)}
        onTransform={(e) => pinLabel(e.target as Konva.Node)}
        onDragEnd={(e) => {
          const node = e.target
          const pos = node.position()
          node.position({ x: xPx, y: yPx })
          onMove({ x: pos.x - xPx, y: pos.y - yPx })
        }}
        onTransformEnd={(e) => onResize(readAndResetBboxTransform(e.target as Konva.Node))}
      />
      <Label ref={labelRef} x={xPx} y={yPx - LABEL_OFFSET_Y} listening={false}>
        <Tag fill="rgba(0,0,0,0.7)" cornerRadius={10} />
        <Text
          text="Capture"
          fontSize={12}
          fill="rgba(251,191,36,0.95)"
          padding={5}
          listening={false}
          perfectDrawEnabled={false}
        />
      </Label>
    </Group>
  )
}
