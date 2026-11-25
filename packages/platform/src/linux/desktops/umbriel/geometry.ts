import { execFileSync } from 'node:child_process'
import { matchGameWindow } from '@platform/common/game-window-identity'
import { detectRuntimeDesktop } from '@platform/select'
import type { LinuxGameDisplayMode } from '@platform/linux/common/game-display-mode'
import type { WindowGeometryProvider } from '@platform/linux/common/wayland/geometry-provider'
import type { WindowBounds } from '@platform/linux/common/wayland/window-geometry'

interface UmbrielWindow {
  id?: string
  title?: string
  app_id?: string
  x?: number
  y?: number
  w?: number
  h?: number
  visible?: boolean
  xwayland?: boolean
  output?: string
}

export interface UmbrielWindowInfo {
  bounds: WindowBounds
  /** Umbriel reports XWayland clients directly; absent means "not reported". */
  mode: LinuxGameDisplayMode | null
  /** Stable compositor id so the tracker does not swap between windows. */
  identity?: string
  identityScore?: number
  /** Compact debug trace for geometry breadcrumbs. */
  detail?: string
}

/** Parses `umbriel windows --json`. Kept separate from the process call so the
 *  matching rules are testable without a running compositor. */
export function parseUmbrielWindowInfo(json: string, titles: readonly string[]): UmbrielWindowInfo | null {
  let windows: unknown
  try {
    windows = JSON.parse(json)
  } catch {
    return null
  }
  if (!Array.isArray(windows)) return null

  for (const entry of windows as UmbrielWindow[]) {
    if (entry.visible === false) continue
    if (
      typeof entry.x !== 'number' ||
      typeof entry.y !== 'number' ||
      typeof entry.w !== 'number' ||
      typeof entry.h !== 'number' ||
      entry.w <= 0 ||
      entry.h <= 0
    ) {
      continue
    }
    const match = matchGameWindow({ title: entry.title, appId: entry.app_id }, titles)
    if (!match.accepted) continue
    const mode = typeof entry.xwayland === 'boolean' ? (entry.xwayland ? 'x11' : 'wayland') : null
    return {
      bounds: { x: entry.x, y: entry.y, width: entry.w, height: entry.h },
      mode,
      identity: entry.id ? `umbriel:${entry.id}` : undefined,
      identityScore: match.score,
      detail:
        `id=${entry.id ?? '-'} title=${entry.title ?? '-'} appId=${entry.app_id ?? '-'} ` +
        `gameMode=${mode ?? '-'} xwayland=${entry.xwayland ?? '-'} output=${entry.output ?? '-'} ` +
        `match=${match.reason} variant=${match.variant ?? '-'} score=${match.score}`,
    }
  }
  return null
}

let available: boolean | undefined

function umbrielAvailable(env: NodeJS.ProcessEnv): boolean {
  if (available !== undefined) return available
  available =
    (env.XDG_CURRENT_DESKTOP ?? '').toLowerCase().includes('umbriel') || detectRuntimeDesktop(env) === 'umbriel'
  return available
}

/**
 * Exact geometry for native Wayland clients, which the X11 hook cannot see.
 * Umbriel reports global logical coordinates, the same space layer-shell uses.
 * Optional by design: other compositors keep the X11/generic geometry path.
 */
export function readUmbrielWindowInfo(
  titles: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): UmbrielWindowInfo | null {
  if (!titles.length || !umbrielAvailable(env)) return null
  try {
    const json = execFileSync('umbriel', ['windows', '--json'], {
      encoding: 'utf8',
      timeout: 750,
      stdio: ['ignore', 'pipe', 'ignore'],
      env,
    })
    return parseUmbrielWindowInfo(json, titles)
  } catch {
    return null
  }
}

/**
 * Exact geometry for native Wayland clients, which the X11 hook cannot see.
 * Umbriel runs before X11: the native hook matches by title only, so an
 * XWayland Steam window that borrows the game title would otherwise win.
 */
export function createUmbrielGeometryProvider(): WindowGeometryProvider {
  return {
    id: 'umbriel',
    reportSource: 'umbriel',
    phase: 'preferred',
    read: (titles) => {
      const info = readUmbrielWindowInfo(titles)
      return info
        ? {
            bounds: info.bounds,
            logical: true,
            mode: info.mode,
            identity: info.identity,
            identityScore: info.identityScore,
            detail: info.detail,
          }
        : null
    },
  }
}

/** @internal Test-only reset. */
export function __resetUmbrielAvailabilityForTests(): void {
  available = undefined
}
