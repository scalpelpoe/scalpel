import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { nativeImage, screen } from 'electron'
import { getHyprlandGame } from '../hyprland'
import { type HyprClient, hyprlandOverlayBounds, isHyprlandGameContext } from '../hyprland-policy'
import type { CaptureOptions, CaptureResult } from './capture'

const exec = promisify(execFile)

/** One-shot compositor capture. The portal picker steals input from fullscreen
 * games and can end up in its own thumbnail. grim captures only the game's
 * logical rectangle, without a picker, cursor or intermediate screenshot file.
 * Never fall back to the portal on failure: ambient callers also use this API. */
export async function captureHyprlandGame(opts?: CaptureOptions): Promise<CaptureResult> {
  const target = getHyprlandGame()
  if (!target) return { frame: null, failure: 'bounds' }
  try {
    const readActive = async (): Promise<HyprClient> =>
      JSON.parse((await exec('hyprctl', ['-j', 'activewindow'], { timeout: 1000 })).stdout)
    const allowed = (active: HyprClient) =>
      opts?.skipFocusGate ? isHyprlandGameContext(active, target, process.pid) : active.address === target.address
    const active = await readActive()
    if (!allowed(active)) return { frame: null, failure: 'focus' }
    // Read fresh geometry, rather than the tracker's last periodic snapshot.
    const clients: HyprClient[] = JSON.parse((await exec('hyprctl', ['-j', 'clients'], { timeout: 1000 })).stdout)
    const game = clients.find((client) => client.address === target.address)
    if (!game) return { frame: null, failure: 'bounds' }
    const monitors: Array<{ id: number; name: string; x: number; y: number; scale: number }> = JSON.parse(
      (await exec('hyprctl', ['-j', 'monitors'], { timeout: 1000 })).stdout,
    )
    const monitor = monitors.find((m) => m.id === game.monitor)
    const displays = screen.getAllDisplays()
    // XWayland can omit physical connector names. A single-monitor desktop
    // is unambiguous; never guess the first display in a multi-monitor setup.
    const display =
      displays.find((d) => d.label === monitor?.name) ??
      (monitors.length === 1 && displays.length === 1 ? displays[0] : undefined)
    if (!monitor || !display) return { frame: null, failure: 'geometry' }
    const [x, y] = game.at
    const [w, h] = game.size
    if (![x, y, w, h].every(Number.isInteger) || w <= 0 || h <= 0) {
      return { frame: null, failure: 'geometry' }
    }
    const dip = hyprlandOverlayBounds(game, monitor, display).dip
    // Keep native resolution for OCR, bounded at 2160p. The old 1080p cap
    // discarded small affix lettering on high-resolution displays.
    const scale = Math.min(monitor.scale, 2160 / h)
    const { stdout } = await exec('grim', ['-g', `${x},${y} ${w}x${h}`, '-s', String(scale), '-l', '1', '-'], {
      encoding: 'buffer',
      timeout: 5000,
      maxBuffer: 64 * 1024 * 1024,
    })
    // A workspace/focus change during capture must never leak another app's
    // pixels to the plugin. Also reject moves/resizes during the grab.
    const after = await readActive()
    if (!allowed(after)) return { frame: null, failure: 'focus' }
    if (
      after.address === game.address &&
      (after.at[0] !== x || after.at[1] !== y || after.size[0] !== w || after.size[1] !== h)
    ) {
      return { frame: null, failure: 'geometry' }
    }
    const img = nativeImage.createFromBuffer(stdout)
    if (img.isEmpty()) return { frame: null, failure: 'empty-frame' }
    const { width, height } = img.getSize()
    if (Math.abs(width - w * scale) > 1 || Math.abs(height - h * scale) > 1) {
      return { frame: null, failure: 'geometry' }
    }
    return {
      frame: {
        data: img.toBitmap(),
        width,
        height,
        gameSize: { width: dip.width, height: dip.height },
        scale: width / dip.width,
      },
    }
  } catch (error) {
    if (process.env.SCALPEL_DEBUG_LOG) console.error('[screen-capture] Hyprland capture failed (requires grim):', error)
    return { frame: null, failure: 'error' }
  }
}
