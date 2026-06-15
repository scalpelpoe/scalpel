import { useEffect, useState } from 'react'
import { Image as KonvaImage } from 'react-konva'
import type Konva from 'konva'
import type { ImageElement as ImageEl } from '@shared/whiteboard-types'
import type { GameSize } from '../coords'
import { readAndResetBboxTransform, type BboxTransformResult } from '../tools/transform'

interface Props {
  element: ImageEl
  size: GameSize
  listening?: boolean
  draggable?: boolean
  onDragEnd?: (delta: { x: number; y: number }) => void
  onTransformEnd?: (next: BboxTransformResult) => void
}

/** Module-scoped cache of loaded `HTMLImageElement` keyed by data URL. Image
 *  data URLs are large and identical across renders for the same element;
 *  caching avoids re-decoding on every parent state change. The cache lives
 *  for the whiteboard session and is cleared by the window unloading. */
const imageCache = new Map<string, HTMLImageElement>()

/** Load an HTMLImageElement for a data URL with module-level caching. Returns
 *  null on the first render while the image decodes, then the loaded element
 *  once it's ready. */
function useImage(src: string): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(() => {
    const cached = imageCache.get(src)
    return cached && cached.complete && cached.naturalWidth > 0 ? cached : null
  })
  useEffect(() => {
    const cached = imageCache.get(src)
    if (cached && cached.complete && cached.naturalWidth > 0) {
      setImg(cached)
      return
    }
    let cancelled = false
    const next = new Image()
    next.onload = (): void => {
      if (cancelled) return
      imageCache.set(src, next)
      setImg(next)
    }
    next.onerror = (): void => {
      /* swallow - the element renders as nothing if the data URL is corrupt */
    }
    next.src = src
    return (): void => {
      cancelled = true
    }
  }, [src])
  return img
}

export function ImageElement({
  element,
  size,
  listening = true,
  draggable = false,
  onDragEnd,
  onTransformEnd,
}: Props): JSX.Element | null {
  const img = useImage(element.src)
  if (!img) return null

  const xPx = element.bbox.x * size.w
  const yPx = element.bbox.y * size.h
  const wPx = element.bbox.w * size.w
  const hPx = element.bbox.h * size.h
  const rotationDeg = (element.rotation * 180) / Math.PI

  return (
    <KonvaImage
      id={element.id}
      image={img}
      x={xPx}
      y={yPx}
      width={wPx}
      height={hPx}
      rotation={rotationDeg}
      listening={listening}
      draggable={draggable}
      perfectDrawEnabled={false}
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
