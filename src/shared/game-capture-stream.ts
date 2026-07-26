export interface ClientFrameGeometry {
  offsetX: number
  offsetY: number
  clientWidth: number
  clientHeight: number
  scaleX: number
  scaleY: number
}

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Locate the logical game client inside a desktopCapturer window stream.
 *
 * Borderless PoE fills the stream. A decorated window can add a symmetric
 * side border and a larger title-bar offset; the target bounds and display
 * scale identify the client-sized area without hard-coded Windows metrics.
 */
export function clientFrameGeometry(
  frameSize: { width: number; height: number },
  gameSize: { width: number; height: number },
  displayScaleFactor: number,
): ClientFrameGeometry {
  const dpr = Math.max(0.1, displayScaleFactor)
  const expectedClientWidth = Math.max(1, gameSize.width * dpr)
  const expectedClientHeight = Math.max(1, gameSize.height * dpr)
  if (expectedClientWidth <= frameSize.width + 1 && expectedClientHeight <= frameSize.height + 1) {
    const clientWidth = Math.min(frameSize.width, expectedClientWidth)
    const clientHeight = Math.min(frameSize.height, expectedClientHeight)
    const border = Math.max(0, (frameSize.width - clientWidth) / 2)
    return {
      offsetX: border,
      offsetY: Math.max(0, frameSize.height - clientHeight - border),
      clientWidth,
      clientHeight,
      scaleX: clientWidth / gameSize.width,
      scaleY: clientHeight / gameSize.height,
    }
  }

  // Defensive fallback for a stream negotiated below the display's native
  // resolution. Proportional scaling is safer than clipping the client.
  const scale = Math.min(frameSize.width / Math.max(1, gameSize.width), frameSize.height / Math.max(1, gameSize.height))
  const clientWidth = Math.max(1, Math.min(frameSize.width, gameSize.width * scale))
  const clientHeight = Math.max(1, Math.min(frameSize.height, gameSize.height * scale))
  return {
    offsetX: Math.max(0, (frameSize.width - clientWidth) / 2),
    offsetY: Math.max(0, (frameSize.height - clientHeight) / 2),
    clientWidth,
    clientHeight,
    scaleX: clientWidth / gameSize.width,
    scaleY: clientHeight / gameSize.height,
  }
}

export function normalizeGameRect(
  region: CaptureRect | undefined,
  gameSize: { width: number; height: number },
): CaptureRect {
  if (!region) return { x: 0, y: 0, width: gameSize.width, height: gameSize.height }
  const x = Math.max(0, Math.min(gameSize.width - 1, Math.round(region.x)))
  const y = Math.max(0, Math.min(gameSize.height - 1, Math.round(region.y)))
  return {
    x,
    y,
    width: Math.max(1, Math.min(gameSize.width - x, Math.round(region.width))),
    height: Math.max(1, Math.min(gameSize.height - y, Math.round(region.height))),
  }
}
