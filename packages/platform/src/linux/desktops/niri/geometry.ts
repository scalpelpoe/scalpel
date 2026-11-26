import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { currentEnv } from '@platform/select'
import type { PlatformEnv } from '@platform/types'
import { matchGameWindow } from '@platform/common/game-window-identity'
import type { LinuxGameDisplayMode } from '@platform/linux/common/game-display-mode'
import type { WindowGeometryProvider } from '@platform/linux/common/wayland/geometry-provider'
import type { WindowBounds } from '@platform/linux/common/wayland/window-geometry'

const execFileAsync = promisify(execFile)

interface NiriWindowLayout {
  tile_pos_in_workspace_view?: [number, number] | null
  window_offset_in_tile?: [number, number]
  window_size?: [number, number]
  tile_size?: [number, number]
}

interface NiriWindow {
  id?: number
  title?: string | null
  app_id?: string | null
  workspace_id?: number | null
  is_focused?: boolean
  is_fullscreen?: boolean
  is_minimized?: boolean
  layout?: NiriWindowLayout
}

interface NiriWorkspace {
  id?: number
  output?: string | null
}

interface NiriOutput {
  logical?: { x?: number; y?: number }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function validSize(pair: [number, number] | undefined): pair is [number, number] {
  return !!pair && pair.length === 2 && pair.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
}

export interface NiriWindowInfo {
  bounds: WindowBounds
  mode: LinuxGameDisplayMode | null
  fullscreen: boolean
  identity?: string
  identityScore?: number
  confidence: 'focused' | 'visible'
  detail: string
}

/**
 * Parse `niri msg --json windows/outputs/workspaces` output.
 *
 * Niri's stable IPC omits `tile_pos_in_workspace_view` for tiled windows. For
 * a focused window we fall back to the output origin: Niri scrolls the focused
 * tile into view, so its top-left is the output's top-left in the common
 * `center-focused-column "never"` layout. Non-focused windows with no reported
 * position are refused rather than guessed. Floating windows and newer Niri
 * releases report the exact workspace-view position and use the exact path.
 */
export function parseNiriWindowInfo(
  windowsJson: string,
  outputsJson: string,
  workspacesJson: string,
  titles: readonly string[],
): NiriWindowInfo | null {
  const windows = parseJson(windowsJson)
  const outputs = parseJson(outputsJson) as Record<string, NiriOutput> | null
  const workspaces = parseJson(workspacesJson)
  if (!Array.isArray(windows) || !outputs || typeof outputs !== 'object' || !Array.isArray(workspaces)) return null
  if (!titles.length) return null

  const workspaceOutput = new Map<number, string>()
  for (const workspace of workspaces as NiriWorkspace[]) {
    if (typeof workspace.id === 'number' && typeof workspace.output === 'string') {
      workspaceOutput.set(workspace.id, workspace.output)
    }
  }

  for (const window of windows as NiriWindow[]) {
    if (window.is_minimized) continue
    const layout = window.layout
    const tilePos = layout?.tile_pos_in_workspace_view
    const exactPosition =
      !!tilePos && tilePos.length === 2 && tilePos.every((n) => typeof n === 'number' && Number.isFinite(n))
    if (!exactPosition && !window.is_focused) continue
    if (!validSize(layout?.window_size)) continue
    const output = typeof window.workspace_id === 'number' ? workspaceOutput.get(window.workspace_id) : undefined
    const logical = output ? outputs[output]?.logical : undefined
    const originX = typeof logical?.x === 'number' ? logical.x : 0
    const originY = typeof logical?.y === 'number' ? logical.y : 0
    const offset = layout.window_offset_in_tile
    const offsetX = Array.isArray(offset) && typeof offset[0] === 'number' ? offset[0] : 0
    const offsetY = Array.isArray(offset) && typeof offset[1] === 'number' ? offset[1] : 0

    const match = matchGameWindow({ title: window.title, appId: window.app_id }, titles)
    if (!match.accepted) continue

    // Without a reported workspace-view position, only a focused tile can be
    // placed: Niri scrolls it into view, so it starts at the output origin.
    const x = originX + (exactPosition ? tilePos[0] : 0) + offsetX
    const y = originY + (exactPosition ? tilePos[1] : 0) + offsetY

    return {
      bounds: {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(layout.window_size[0]),
        height: Math.round(layout.window_size[1]),
      },
      // Niri does not report whether a client is XWayland in these IPC replies.
      mode: null,
      fullscreen: window.is_fullscreen === true,
      identity: typeof window.id === 'number' ? `niri:${window.id}` : undefined,
      identityScore: match.score,
      confidence: window.is_focused ? 'focused' : 'visible',
      detail:
        `id=${window.id ?? '-'} title=${window.title ?? '-'} appId=${window.app_id ?? '-'} ` +
        `output=${output ?? '-'} workspace=${window.workspace_id ?? '-'} fullscreen=${window.is_fullscreen ?? false} ` +
        `pos=${exactPosition ? 'workspace-view' : 'focused-tile-approx'} ` +
        `match=${match.reason} variant=${match.variant ?? '-'} score=${match.score}`,
    }
  }
  return null
}

let available: boolean | undefined

function niriAvailable(env: PlatformEnv): boolean {
  if (available !== undefined) return available
  available = !!env.env.NIRI_SOCKET || (env.env.XDG_CURRENT_DESKTOP ?? '').toLowerCase().includes('niri')
  return available
}

async function niriJson(args: string[], env: PlatformEnv): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('niri', ['msg', '--json', ...args], {
      encoding: 'utf8',
      timeout: 750,
      env: env.env,
    })
    return stdout
  } catch {
    return null
  }
}

export async function readNiriWindowInfo(
  titles: readonly string[],
  env: PlatformEnv = currentEnv(),
): Promise<NiriWindowInfo | null> {
  if (!titles.length || !niriAvailable(env)) return null
  const [windows, outputs, workspaces] = await Promise.all([
    niriJson(['windows'], env),
    niriJson(['outputs'], env),
    niriJson(['workspaces'], env),
  ])
  if (!windows || !outputs || !workspaces) return null
  return parseNiriWindowInfo(windows, outputs, workspaces, titles)
}

export function createNiriGeometryProvider(env: PlatformEnv = currentEnv()): WindowGeometryProvider {
  return {
    id: 'niri',
    reportSource: 'niri',
    phase: 'preferred',
    read: async (titles) => {
      const info = await readNiriWindowInfo(titles, env)
      return info
        ? {
            bounds: info.bounds,
            logical: true,
            mode: info.mode,
            fullscreen: info.fullscreen,
            identity: info.identity,
            identityScore: info.identityScore,
            confidence: info.confidence,
            detail: info.detail,
          }
        : null
    },
  }
}

/** @internal Test-only reset. */
export function __resetNiriAvailabilityForTests(): void {
  available = undefined
}
