import { useCallback, useEffect, useRef, useState } from 'react'
import { requireCalculator, requireData } from '../crystalline'
import { jewelIconUrl } from '../jewel-icons'
import type { Node } from './skill-tree-types'
import {
  baseJewelRadius,
  calculateNodePos,
  distance,
  drawnGroups,
  drawnNodes,
  formatStats,
  inverseSprites,
  inverseSpritesActive,
  inverseTranslations,
  orbitAngleAt,
  skillTree,
  toCanvasCoords,
  type Point,
} from './skill-tree'

const START_GROUPS = [427, 320, 226, 227, 323, 422, 329]
const TITLE_FONT = '25px Roboto Mono'
const STATS_FONT = '17px Roboto Mono'
const DRAW_SCALING = 2.6

const spriteCache: Record<string, HTMLImageElement> = {}
const spriteCacheActive: Record<string, HTMLImageElement> = {}
const jewelArtCache: Record<string, HTMLImageElement> = {}

function loadCachedImage(
  cache: Record<string, HTMLImageElement>,
  url: string,
  onImageLoad?: () => void,
): HTMLImageElement {
  if (!(url in cache)) {
    const img = new Image()
    img.onload = () => onImageLoad?.()
    img.src = url
    cache[url] = img
  }
  return cache[url]
}

function drawSprite(
  context: CanvasRenderingContext2D,
  path: string,
  pos: Point,
  scaling: number,
  active = false,
  mirrored = false,
  onImageLoad?: () => void,
) {
  let sprite = active ? inverseSpritesActive[path] : inverseSprites[path]
  if (!sprite && active) {
    sprite = inverseSprites[path]
  }
  if (!sprite) return

  const spriteSheetUrl = sprite.filename
  const cache = active ? spriteCacheActive : spriteCache
  const sheet = loadCachedImage(cache, spriteSheetUrl, onImageLoad)
  if (!sheet.complete || sheet.naturalWidth === 0) return

  const self = sprite.coords[path]
  if (!self) return

  const newWidth = (self.w / scaling) * DRAW_SCALING
  const newHeight = (self.h / scaling) * DRAW_SCALING
  const topLeftX = pos.x - newWidth / 2
  const topLeftY = pos.y - newHeight / 2
  let finalY = topLeftY

  if (mirrored) {
    finalY = topLeftY - newHeight / 2
  }

  context.drawImage(sheet, self.x, self.y, self.w, self.h, topLeftX, finalY, newWidth, newHeight)

  if (mirrored) {
    context.save()
    context.translate(topLeftX, topLeftY)
    context.rotate(Math.PI)
    context.drawImage(sheet, self.x, self.y, self.w, self.h, -newWidth, -(newHeight / 2), newWidth, -newHeight)
    context.restore()
  }
}

/** Draw Timeless Jewel item art centered in a socket (on top of the frame). */
function drawJewelArt(
  context: CanvasRenderingContext2D,
  url: string,
  pos: Point,
  scaling: number,
  onImageLoad?: () => void,
) {
  const img = loadCachedImage(jewelArtCache, url, onImageLoad)
  if (!img.complete || img.naturalWidth === 0) return

  // Fit inside JewelFrameAllocated's inner hole (~70% of frame sprite).
  const frame = inverseSprites['JewelFrameAllocated']
  const frameCoord = frame?.coords?.['JewelFrameAllocated']
  const frameSize = frameCoord
    ? (Math.min(frameCoord.w, frameCoord.h) / scaling) * DRAW_SCALING
    : (100 / scaling) * DRAW_SCALING
  const size = frameSize * 0.72

  context.save()
  context.beginPath()
  context.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2)
  context.clip()
  context.drawImage(img, pos.x - size / 2, pos.y - size / 2, size, size)
  context.restore()
}

function wrapText(text: string, context: CanvasRenderingContext2D, width: number): string[] {
  const result: string[] = []
  let currentWord = ''

  text.split(' ').forEach((word) => {
    if (context.measureText(currentWord + word).width < width) {
      currentWord += ' ' + word
    } else {
      result.push(currentWord.trim())
      currentWord = word
    }
  })

  if (currentWord.length > 0) {
    result.push(currentWord.trim())
  }

  return result
}

type StatLine = { text: string; special: boolean }

function buildHoverStats(
  node: Node,
  hoveredNodeActive: boolean,
  seed: number,
  selectedJewel: number,
  selectedConqueror: string,
): { nodeName: string; nodeStats: StatLine[] } {
  let nodeName = node.name ?? ''
  let nodeStats: StatLine[] = (node.stats ?? []).map((s) => ({ text: s, special: false }))

  if (!node.isJewelSocket && hoveredNodeActive && node.skill && seed && selectedJewel && selectedConqueror) {
    const calculator = requireCalculator()
    const data = requireData()
    const result = calculator.Calculate(data.TreeToPassive[node.skill].Index, seed, selectedJewel, selectedConqueror)

    if (result) {
      if ('AlternatePassiveSkill' in result && result.AlternatePassiveSkill) {
        nodeStats = []
        nodeName = result.AlternatePassiveSkill.Name

        if ('StatsKeys' in result.AlternatePassiveSkill && result.AlternatePassiveSkill.StatsKeys) {
          result.AlternatePassiveSkill.StatsKeys.forEach((statId, i) => {
            const stat = data.GetStatByIndex(statId)
            if (!stat) return
            const translation = inverseTranslations[stat.ID] || ''
            if (translation) {
              nodeStats.push({
                text: formatStats(translation, result.StatRolls?.[i] ?? 0) || stat.ID,
                special: true,
              })
            }
          })
        }
      }

      if (result.AlternatePassiveAdditionInformations) {
        result.AlternatePassiveAdditionInformations.forEach((info) => {
          if (info.AlternatePassiveAddition && 'StatsKeys' in info.AlternatePassiveAddition) {
            info.AlternatePassiveAddition.StatsKeys?.forEach((statId, i) => {
              const stat = data.GetStatByIndex(statId)
              if (!stat) return
              const translation = inverseTranslations[stat.ID] || ''
              if (translation) {
                nodeStats.push({
                  text: formatStats(translation, info.StatRolls?.[i] ?? 0) || stat.ID,
                  special: true,
                })
              }
            })
          }
        })
      }
    }
  }

  return { nodeName, nodeStats }
}

interface DrawResult {
  hoveredNode?: Node
  hoveredNodeActive: boolean
}

function drawTree(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
  scaling: number,
  mousePos: Point,
  circledNode: number | undefined,
  highlighted: number[],
  disabled: number[],
  highlightJewels: boolean,
  slowTime: number,
  seed: number,
  selectedJewel: number,
  selectedConqueror: string,
  placedJewelIconUrl: string | undefined,
  onImageLoad?: () => void,
): DrawResult {
  const jewelRadius = baseJewelRadius / scaling

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#080c11'
  context.fillRect(0, 0, width, height)

  const connected: Record<string, boolean> = {}

  Object.keys(drawnGroups).forEach((groupId) => {
    const group = drawnGroups[parseInt(groupId)]
    const groupPos = toCanvasCoords(group.x, group.y, offsetX, offsetY, scaling)
    const maxOrbit = Math.max(...group.orbits)

    if (START_GROUPS.indexOf(parseInt(groupId)) >= 0) {
      // Do not draw starter nodes
    } else if (maxOrbit === 1) {
      drawSprite(context, 'PSGroupBackground1', groupPos, scaling, false, false, onImageLoad)
    } else if (maxOrbit === 2) {
      drawSprite(context, 'PSGroupBackground2', groupPos, scaling, false, false, onImageLoad)
    } else if (maxOrbit === 3 || group.orbits.length > 1) {
      drawSprite(context, 'PSGroupBackground3', groupPos, scaling, false, true, onImageLoad)
    }
  })

  Object.keys(drawnNodes).forEach((nodeId) => {
    const node = drawnNodes[parseInt(nodeId)]
    const angle = orbitAngleAt(node.orbit ?? 0, node.orbitIndex ?? 0)
    const rotatedPos = calculateNodePos(node, offsetX, offsetY, scaling)

    node.out?.forEach((o) => {
      if (!drawnNodes[parseInt(o)]) return

      const min = Math.min(parseInt(o), parseInt(nodeId))
      const max = Math.max(parseInt(o), parseInt(nodeId))
      const joined = min + ':' + max

      if (joined in connected) return
      connected[joined] = true

      const targetNode = drawnNodes[parseInt(o)]
      if (!targetNode || targetNode.isMastery) return

      const targetAngle = orbitAngleAt(targetNode.orbit ?? 0, targetNode.orbitIndex ?? 0)
      const targetRotatedPos = calculateNodePos(targetNode, offsetX, offsetY, scaling)

      context.beginPath()

      if (node.group !== targetNode.group || node.orbit !== targetNode.orbit) {
        context.moveTo(rotatedPos.x, rotatedPos.y)
        context.lineTo(targetRotatedPos.x, targetRotatedPos.y)
      } else {
        let a = Math.PI / 180 - (Math.PI / 180) * angle
        let b = Math.PI / 180 - (Math.PI / 180) * targetAngle

        a -= Math.PI / 2
        b -= Math.PI / 2

        const diff = Math.abs(Math.max(a, b) - Math.min(a, b))
        const finalA = diff > Math.PI ? Math.max(a, b) : Math.min(a, b)
        const finalB = diff > Math.PI ? Math.min(a, b) : Math.max(a, b)

        const group = drawnGroups[node.group ?? 0]
        const groupPos = toCanvasCoords(group.x, group.y, offsetX, offsetY, scaling)
        context.arc(
          groupPos.x,
          groupPos.y,
          skillTree.constants.orbitRadii[node.orbit ?? 0] / scaling + 1,
          finalA,
          finalB,
        )
      }

      context.lineWidth = 6 / scaling
      context.strokeStyle = '#524518'
      context.stroke()
    })
  })

  let circledNodePos: Point | undefined
  if (circledNode !== undefined) {
    circledNodePos = calculateNodePos(drawnNodes[circledNode], offsetX, offsetY, scaling)
    context.strokeStyle = '#ad2b2b'
  }

  let hoveredNodeActive = false
  let hoveredNode: Node | undefined

  Object.keys(drawnNodes).forEach((nodeId) => {
    const node = drawnNodes[parseInt(nodeId)]
    const rotatedPos = calculateNodePos(node, offsetX, offsetY, scaling)
    let touchDistance = 0

    let active = false
    if (circledNodePos) {
      if (distance(rotatedPos, circledNodePos) < jewelRadius) {
        active = true
      }
    }

    if (node.skill !== undefined && disabled.indexOf(node.skill) >= 0) {
      active = false
    }

    const isPlacedSocket =
      circledNode !== undefined && (node.skill === circledNode || parseInt(nodeId, 10) === circledNode)

    if (node.isKeystone) {
      touchDistance = 110
      drawSprite(context, node.icon ?? '', rotatedPos, scaling, active, false, onImageLoad)
      if (active) {
        drawSprite(context, 'KeystoneFrameAllocated', rotatedPos, scaling, false, false, onImageLoad)
      } else {
        drawSprite(context, 'KeystoneFrameUnallocated', rotatedPos, scaling, false, false, onImageLoad)
      }
    } else if (node.isNotable) {
      touchDistance = 70
      drawSprite(context, node.icon ?? '', rotatedPos, scaling, active, false, onImageLoad)
      if (active) {
        drawSprite(context, 'NotableFrameAllocated', rotatedPos, scaling, false, false, onImageLoad)
      } else {
        drawSprite(context, 'NotableFrameUnallocated', rotatedPos, scaling, false, false, onImageLoad)
      }
    } else if (node.isJewelSocket) {
      touchDistance = 70
      if (isPlacedSocket) {
        // Frame first — allocated frame has an opaque center that covers art drawn under it.
        drawSprite(context, 'JewelFrameAllocated', rotatedPos, scaling, false, false, onImageLoad)
        if (placedJewelIconUrl) {
          // Unique Timeless Jewel art (Glorious Vanity / Lethal Pride / …) clipped to the socket.
          drawJewelArt(context, placedJewelIconUrl, rotatedPos, scaling, onImageLoad)
        } else if (inverseSprites['JewelSocketActiveLegion']) {
          drawSprite(context, 'JewelSocketActiveLegion', rotatedPos, scaling, false, false, onImageLoad)
        }
      } else if (node.expansionJewel) {
        drawSprite(context, 'JewelSocketAltNormal', rotatedPos, scaling, false, false, onImageLoad)
      } else if (active) {
        drawSprite(context, 'JewelFrameAllocated', rotatedPos, scaling, false, false, onImageLoad)
      } else {
        drawSprite(context, 'JewelFrameUnallocated', rotatedPos, scaling, false, false, onImageLoad)
      }
    } else if (node.isMastery) {
      drawSprite(context, node.inactiveIcon ?? '', rotatedPos, scaling, active, false, onImageLoad)
    } else {
      touchDistance = 50
      drawSprite(context, node.icon ?? '', rotatedPos, scaling, active, false, onImageLoad)
      if (active) {
        drawSprite(context, 'PSSkillFrameActive', rotatedPos, scaling, false, false, onImageLoad)
      } else {
        drawSprite(context, 'PSSkillFrame', rotatedPos, scaling, false, false, onImageLoad)
      }
    }

    if ((node.skill !== undefined && highlighted.indexOf(node.skill) >= 0) || (highlightJewels && node.isJewelSocket)) {
      context.strokeStyle = `hsl(${slowTime}, 100%, 50%)`
      context.lineWidth = 3
      context.beginPath()
      context.arc(rotatedPos.x, rotatedPos.y, (touchDistance + 30) / scaling, 0, Math.PI * 2)
      context.stroke()
    }

    if (distance(rotatedPos, mousePos) < touchDistance / scaling) {
      hoveredNode = node
      hoveredNodeActive = active
    }
  })

  if (circledNodePos) {
    context.strokeStyle = '#ad2b2b'
    context.lineWidth = 1
    context.beginPath()
    context.arc(circledNodePos.x, circledNodePos.y, jewelRadius, 0, Math.PI * 2)
    context.stroke()
  }

  if (hoveredNode) {
    const { nodeName, nodeStats } = buildHoverStats(
      hoveredNode,
      hoveredNodeActive,
      seed,
      selectedJewel,
      selectedConqueror,
    )

    context.font = TITLE_FONT
    const textMetrics = context.measureText(nodeName)
    const maxWidth = Math.max(textMetrics.width + 50, 600)
    context.font = STATS_FONT

    const allLines: { text: string; offset: number; special: boolean }[] = []
    const padding = 30
    let offset = 85

    if (nodeStats.length > 0) {
      nodeStats.forEach((stat) => {
        if (allLines.length > 0) offset += 5
        stat.text.split('\n').forEach((line) => {
          if (allLines.length > 0) offset += 10
          wrapText(line, context, maxWidth - padding).forEach((l) => {
            allLines.push({ text: l, offset, special: stat.special })
            offset += 20
          })
        })
      })
    } else if (hoveredNode.isJewelSocket) {
      allLines.push({ text: 'Click to select this socket', offset, special: true })
      offset += 20
    }

    const titleHeight = 55

    context.fillStyle = 'rgba(75,63,24,0.9)'
    context.fillRect(mousePos.x, mousePos.y, maxWidth, titleHeight)

    context.fillStyle = '#ffffff'
    context.font = TITLE_FONT
    context.textAlign = 'center'
    context.fillText(nodeName, mousePos.x + maxWidth / 2, mousePos.y + 35)

    context.fillStyle = 'rgba(0,0,0,0.8)'
    context.fillRect(mousePos.x, mousePos.y + titleHeight, maxWidth, offset - titleHeight)

    context.font = STATS_FONT
    context.textAlign = 'left'
    allLines.forEach((l) => {
      context.fillStyle = l.special ? '#8cf34c' : '#ffffff'
      context.fillText(l.text, mousePos.x + padding / 2, mousePos.y + l.offset)
    })
  }

  return { hoveredNode, hoveredNodeActive }
}

export interface SkillTreeCanvasProps {
  circledNode: number | undefined
  selectedJewel: number
  selectedConqueror: string
  seed: number
  jewelName?: string
  highlighted?: number[]
  disabled?: number[]
  highlightJewels?: boolean
  onClickNode: (node: { skill?: number; isJewelSocket?: boolean; name?: string }) => void
}

export function SkillTreeCanvas({
  circledNode,
  selectedJewel,
  selectedConqueror,
  seed,
  jewelName,
  highlighted = [],
  disabled = [],
  highlightJewels = false,
  onClickNode,
}: SkillTreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hoveredRef = useRef<Node | undefined>(undefined)
  const initializedRef = useRef(false)

  const [size, setSize] = useState({ width: 0, height: 0 })
  const [scaling, setScaling] = useState(10)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [mousePos, setMousePos] = useState<Point>({ x: Number.MIN_VALUE, y: Number.MIN_VALUE })
  const [slowTime, setSlowTime] = useState(0)
  const [cursor, setCursor] = useState('unset')
  const [spriteEpoch, setSpriteEpoch] = useState(0)

  const placedJewelIconUrl = jewelIconUrl(jewelName, selectedJewel)
  const imageLoadPendingRef = useRef(false)
  const onImageLoad = useCallback(() => {
    if (imageLoadPendingRef.current) return
    imageLoadPendingRef.current = true
    requestAnimationFrame(() => {
      imageLoadPendingRef.current = false
      setSpriteEpoch((n) => n + 1)
    })
  }, [])

  const panRef = useRef({
    down: false,
    downX: 0,
    downY: 0,
    startX: 0,
    startY: 0,
  })

  const viewRef = useRef({ offsetX, offsetY, scaling })
  viewRef.current = { offsetX, offsetY, scaling }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const report = () => {
      const { width, height } = el.getBoundingClientRect()
      setSize({ width: Math.floor(width), height: Math.floor(height) })
    }

    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!initializedRef.current && size.width > 0 && size.height > 0) {
      initializedRef.current = true
      setOffsetX(skillTree.min_x + (size.width / 2) * scaling)
      setOffsetY(skillTree.min_y + (size.height / 2) * scaling)
    }
  }, [size.width, size.height, scaling])

  const needsAnimation = highlighted.length > 0 || highlightJewels

  useEffect(() => {
    if (!needsAnimation) {
      setSlowTime(0)
      return
    }

    let frame = 0
    const tick = (t: number) => {
      setSlowTime(Math.round(t / 40))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [needsAnimation])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || size.width === 0 || size.height === 0) return

    canvas.width = size.width
    canvas.height = size.height

    const context = canvas.getContext('2d')
    if (!context) return

    const result = drawTree(
      context,
      size.width,
      size.height,
      offsetX,
      offsetY,
      scaling,
      mousePos,
      circledNode,
      highlighted,
      disabled,
      highlightJewels,
      slowTime,
      seed,
      selectedJewel,
      selectedConqueror,
      placedJewelIconUrl,
      onImageLoad,
    )

    hoveredRef.current = result.hoveredNode
    setCursor(result.hoveredNode?.isJewelSocket ? 'pointer' : 'unset')
  }, [
    size.width,
    size.height,
    offsetX,
    offsetY,
    scaling,
    mousePos,
    circledNode,
    highlighted,
    disabled,
    highlightJewels,
    slowTime,
    seed,
    selectedJewel,
    selectedConqueror,
    placedJewelIconUrl,
    onImageLoad,
    spriteEpoch,
  ])

  useEffect(() => {
    redraw()
  }, [redraw])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
      const { scaling: currentScaling, offsetX: ox, offsetY: oy } = viewRef.current
      const newScaling = Math.min(30, Math.max(3, currentScaling + event.deltaY / 100))
      const dScale = newScaling - currentScaling

      if (dScale !== 0) {
        const rect = el.getBoundingClientRect()
        const localX = event.clientX - rect.left
        const localY = event.clientY - rect.top
        setOffsetX(ox + localX * dScale)
        setOffsetY(oy + localY * dScale)
        setScaling(newScaling)
      }

      event.preventDefault()
      event.stopPropagation()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      panRef.current = {
        down: true,
        downX: event.nativeEvent.offsetX,
        downY: event.nativeEvent.offsetY,
        startX: offsetX,
        startY: offsetY,
      }

      setMousePos({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })

      const hovered = hoveredRef.current
      if (hovered) {
        onClickNode({
          skill: hovered.skill,
          isJewelSocket: hovered.isJewelSocket,
          name: hovered.name,
        })
      }
    },
    [offsetX, offsetY, onClickNode],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const pan = panRef.current
      if (pan.down) {
        setOffsetX(pan.startX - (pan.downX - event.nativeEvent.offsetX) * scaling)
        setOffsetY(pan.startY - (pan.downY - event.nativeEvent.offsetY) * scaling)
      }

      setMousePos({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })
    },
    [scaling],
  )

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    panRef.current.down = false
    setMousePos({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })
  }, [])

  useEffect(() => {
    const onWindowPointerUp = (event: PointerEvent) => {
      panRef.current.down = false
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      setMousePos({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }

    const onWindowPointerMove = (event: PointerEvent) => {
      const pan = panRef.current
      if (!pan.down) return

      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const localX = event.clientX - rect.left
      const localY = event.clientY - rect.top

      setOffsetX(pan.startX - (pan.downX - localX) * viewRef.current.scaling)
      setOffsetY(pan.startY - (pan.downY - localY) * viewRef.current.scaling)
      setMousePos({ x: localX, y: localY })
    }

    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointermove', onWindowPointerMove)
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointermove', onWindowPointerMove)
    }
  }, [])

  if (size.width === 0 || size.height === 0) {
    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', touchAction: 'none', cursor }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  )
}
