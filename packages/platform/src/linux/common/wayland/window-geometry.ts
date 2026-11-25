import type { WaylandOutput } from 'electron-overlay-window/dist/wayland/host'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

interface Rect extends WindowBounds {}

const near = (a: number, b: number, tolerance = 2): boolean => Math.abs(a - b) <= tolerance

const logicalRect = (output: WaylandOutput): Rect => ({
  x: output.x,
  y: output.y,
  width: output.width,
  height: output.height,
})

/** zxdg_output reports logical positions, but X11 clients may see either
 *  logical or physical pixels depending on the compositor's XWayland scaling. */
const physicalRect = (output: WaylandOutput): Rect => ({
  x: output.x * output.scale,
  y: output.y * output.scale,
  width: output.width * output.scale,
  height: output.height * output.scale,
})

const center = (r: Rect): { x: number; y: number } => ({
  x: r.x + r.width / 2,
  y: r.y + r.height / 2,
})

const contains = (r: Rect, x: number, y: number): boolean =>
  x >= r.x - 1 && x < r.x + r.width + 1 && y >= r.y - 1 && y < r.y + r.height + 1

const overlap = (a: Rect, b: Rect): number => {
  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return Math.max(0, right - left) * Math.max(0, bottom - top)
}

const rounded = (r: Rect): WindowBounds => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  width: Math.max(1, Math.round(r.width)),
  height: Math.max(1, Math.round(r.height)),
})

const fromPhysical = (bounds: Rect, output: WaylandOutput): WindowBounds => {
  const physical = physicalRect(output)
  return rounded({
    x: output.x + (bounds.x - physical.x) / output.scale,
    y: output.y + (bounds.y - physical.y) / output.scale,
    width: bounds.width / output.scale,
    height: bounds.height / output.scale,
  })
}

function isFullscreenAgainstOutput(bounds: Rect, output: WaylandOutput): boolean {
  const sizeOnly =
    near(bounds.width, output.width) &&
    near(bounds.height, output.height) &&
    near(bounds.width, output.width * output.scale) === false
  const physicalSize =
    near(bounds.width, output.width * output.scale) && near(bounds.height, output.height * output.scale)
  const logicalPosition = near(bounds.x, output.x) && near(bounds.y, output.y)
  const physicalPosition = near(bounds.x, output.x * output.scale) && near(bounds.y, output.y * output.scale)
  return (sizeOnly && logicalPosition) || (physicalSize && (physicalPosition || logicalPosition))
}

function mapGlobalBounds(
  bounds: Rect,
  outputs: readonly WaylandOutput[],
  outputNames: readonly string[],
): WindowBounds {
  if (!outputs.length) return rounded(bounds)

  const fullscreen = outputs.find((output) => isFullscreenAgainstOutput(bounds, output))
  if (fullscreen) return logicalRect(fullscreen)

  const named = outputs.filter((output) => outputNames.includes(output.name))
  const candidates = named.length ? named : outputs
  const { x: cx, y: cy } = center(bounds)

  const logical = candidates.find((output) => contains(logicalRect(output), cx, cy))
  if (logical) return rounded(bounds)

  const physical = candidates.find((output) => contains(physicalRect(output), cx, cy))
  if (physical) return fromPhysical(bounds, physical)

  let bestLogicalArea = 0
  let bestPhysical: WaylandOutput | null = null
  let bestPhysicalArea = 0
  for (const output of candidates) {
    const logicalArea = overlap(bounds, logicalRect(output))
    if (logicalArea > bestLogicalArea) bestLogicalArea = logicalArea
    const physicalArea = overlap(bounds, physicalRect(output))
    if (physicalArea > bestPhysicalArea) {
      bestPhysical = output
      bestPhysicalArea = physicalArea
    }
  }
  if (bestPhysical && bestPhysicalArea > bestLogicalArea) return fromPhysical(bounds, bestPhysical)
  return rounded(bounds)
}

/**
 * Converts X11 geometry of an XWayland window into logical coordinates for
 * layer-shell surfaces. Fullscreen windows snap to their output; windowed
 * windows are classified by whether their center lies in a logical or physical
 * output rectangle. Foreign-toplevel output names disambiguate equal-scale
 * monitors and keep a window on the right monitor with fractional scaling.
 */
export function mapX11BoundsToLogical(
  bounds: Rect,
  outputs: readonly WaylandOutput[],
  outputNames: readonly string[] = [],
): WindowBounds {
  if (!outputs.length) return rounded(bounds)
  const direct = mapGlobalBounds(bounds, outputs, outputNames)
  if (outputs.some((output) => isFullscreenAgainstOutput(bounds, output))) return direct

  const candidates = outputNames.length ? outputs.filter((output) => outputNames.includes(output.name)) : outputs
  const list = candidates.length ? candidates : outputs
  const { x: cx, y: cy } = center(bounds)

  const logicalOrigin = {
    x: Math.min(...outputs.map((output) => output.x)),
    y: Math.min(...outputs.map((output) => output.y)),
  }
  const xRootLogical = {
    x: bounds.x + logicalOrigin.x,
    y: bounds.y + logicalOrigin.y,
    width: bounds.width,
    height: bounds.height,
  }
  if (list.some((output) => contains(logicalRect(output), cx + logicalOrigin.x, cy + logicalOrigin.y))) {
    return mapGlobalBounds(xRootLogical, outputs, outputNames)
  }

  const physicalOrigin = {
    x: Math.min(...outputs.map((output) => output.x * output.scale)),
    y: Math.min(...outputs.map((output) => output.y * output.scale)),
  }
  const xRootPhysical = {
    x: bounds.x + physicalOrigin.x,
    y: bounds.y + physicalOrigin.y,
    width: bounds.width,
    height: bounds.height,
  }
  if (list.some((output) => contains(physicalRect(output), cx + physicalOrigin.x, cy + physicalOrigin.y))) {
    return mapGlobalBounds(xRootPhysical, outputs, outputNames)
  }

  return direct
}
