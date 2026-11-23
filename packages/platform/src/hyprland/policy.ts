export interface HyprClient {
  address: string
  pid: number
  title: string
  workspace: { id: number }
  at: [number, number]
  size: [number, number]
  floating: boolean
  monitor?: number
}

/** Oldest Hyprland this overlay path is exercised against. Earlier releases
 *  lack the `hyprctl eval` Lua API it drives (hl.get_config, hl.dsp.*) and keep
 *  using the X11 tracker, which is what they run today. */
export const MIN_HYPRLAND: readonly [number, number, number] = [0, 56, 0]

/** `hyprctl -j version` reports tags like "v0.56.0", or "v0.56.0-13-gdeadbee"
 *  for -git builds. Unreadable output fails closed: keep the X11 tracker rather
 *  than drive a compositor whose capabilities we couldn't confirm. */
export function hyprlandVersionAtLeast(versionJson: string, min = MIN_HYPRLAND): boolean {
  let tag: unknown
  try {
    tag = (JSON.parse(versionJson) as { tag?: unknown }).tag
  } catch {
    return false
  }
  const parsed = typeof tag === 'string' ? /^v?(\d+)\.(\d+)\.(\d+)/.exec(tag) : null
  if (!parsed) return false
  for (const [index, bound] of min.entries()) {
    const part = Number(parsed[index + 1])
    if (part !== bound) return part > bound
  }
  return true
}

export function hyprlandOverlayBounds(
  client: HyprClient,
  monitor: { x: number; y: number; scale: number },
  display: { bounds: { x: number; y: number }; scaleFactor: number },
) {
  const ratio = monitor.scale / display.scaleFactor
  const dip = {
    x: Math.round(display.bounds.x + (client.at[0] - monitor.x) * ratio),
    y: Math.round(display.bounds.y + (client.at[1] - monitor.y) * ratio),
    width: Math.round(client.size[0] * ratio),
    height: Math.round(client.size[1] * ratio),
  }
  return {
    dip,
    physical: {
      x: Math.round(dip.x * display.scaleFactor),
      y: Math.round(dip.y * display.scaleFactor),
      width: Math.round(client.size[0] * monitor.scale),
      height: Math.round(client.size[1] * monitor.scale),
    },
  }
}

export function isHyprlandGameContext(active: HyprClient | null, game: HyprClient | null, pid: number): boolean {
  if (!active?.address || !game?.address || active.workspace?.id !== game.workspace.id) return false
  return active.address === game.address || (active.pid === pid && active.title.startsWith('Scalpel Overlay'))
}
