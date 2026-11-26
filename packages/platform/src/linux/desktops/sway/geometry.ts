import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { reportBreadcrumb } from '@platform/common/diagnostics'
import { matchGameWindow, type GameWindowMatch } from '@platform/common/game-window-identity'
import { currentEnv } from '@platform/select'
import type { PlatformEnv } from '@platform/types'
import type { LinuxGameDisplayMode } from '@platform/linux/common/game-display-mode'
import type {
  GeometryConfidence,
  WindowGeometryInfo,
  WindowGeometryProvider,
} from '@platform/linux/common/wayland/geometry-provider'

const execFileAsync = promisify(execFile)

interface SwayRect {
  x?: number
  y?: number
  width?: number
  height?: number
}

interface SwayNode {
  id?: number
  name?: string | null
  type?: string
  output?: string | null
  rect?: SwayRect
  window_rect?: SwayRect
  fullscreen_mode?: number
  shell?: string | null
  app_id?: string | null
  visible?: boolean
  focused?: boolean
  window_properties?: {
    title?: string | null
    class?: string | null
    instance?: string | null
  }
  nodes?: SwayNode[]
  floating_nodes?: SwayNode[]
}

interface Candidate {
  readonly info: WindowGeometryInfo
  /** Focused beats visible, which beats hidden/stale. */
  readonly rank: number
  readonly order: number
}

const fmtRect = (rect: SwayRect | undefined): string =>
  rect ? `${rect.x ?? '-'},${rect.y ?? '-'} ${rect.width ?? '-'}x${rect.height ?? '-'}` : '-'

const validRect = (rect: SwayRect | undefined): rect is Required<SwayRect> =>
  Boolean(
    rect &&
      typeof rect.x === 'number' &&
      typeof rect.y === 'number' &&
      typeof rect.width === 'number' &&
      typeof rect.height === 'number' &&
      rect.width > 0 &&
      rect.height > 0,
  )

function gameMatch(node: SwayNode, titles: readonly string[]) {
  return matchGameWindow(
    {
      title: node.name ?? node.window_properties?.title ?? null,
      appId: node.app_id,
      className: node.window_properties?.class,
      instance: node.window_properties?.instance,
      shell: node.shell,
    },
    titles,
  )
}

function displayMode(shell: string | null | undefined): LinuxGameDisplayMode | null {
  if (shell === 'xwayland') return 'x11'
  if (shell === 'xdg_shell') return 'wayland'
  return null
}

function confidence(visible: boolean, focused: boolean): GeometryConfidence {
  if (focused) return 'focused'
  return visible ? 'visible' : 'hidden'
}

function detailOf(
  node: SwayNode,
  mode: LinuxGameDisplayMode | null,
  content: WindowGeometryInfo['bounds'],
  output: string | null | undefined,
  level: GeometryConfidence,
  match: GameWindowMatch,
): string {
  return (
    `node=${node.id ?? '-'} type=${node.type ?? '-'} shell=${node.shell ?? '-'} gameMode=${mode ?? '-'} ` +
    `name=${node.name ?? node.window_properties?.title ?? '-'} appId=${node.app_id ?? '-'} ` +
    `class=${node.window_properties?.class ?? '-'} instance=${node.window_properties?.instance ?? '-'} ` +
    `visible=${node.visible !== false} focused=${node.focused === true} ` +
    `fullscreen=${(node.fullscreen_mode ?? 0) > 0} confidence=${level} ` +
    `match=${match.reason} variant=${match.variant ?? '-'} score=${match.score} ` +
    `rect=${fmtRect(node.rect)} content=${fmtRect(content)} output=${output ?? '-'}`
  )
}

/**
 * Parses `swaymsg -t get_tree` into the logical geometry layer-shell needs.
 * Sway's `rect` is already compositor-global logical coordinates, and
 * `window_rect` is the content area relative to `rect`, so neither the X11
 * origin fudge nor the per-output scale conversion applies here.
 */
export function parseSwayTree(
  json: string,
  titles: readonly string[],
  preferredIdentity?: string,
): WindowGeometryInfo | null {
  let root: unknown
  try {
    root = JSON.parse(json)
  } catch {
    return null
  }
  if (!root || typeof root !== 'object' || !titles.length) return null

  const candidates: Candidate[] = []
  let order = 0

  const visit = (node: SwayNode, output: string | null | undefined): void => {
    if (!node || typeof node !== 'object') return
    const nextOutput = (node.type === 'output' ? node.name : node.output) ?? output

    const match = gameMatch(node, titles)
    if (match.accepted && validRect(node.rect)) {
      const content = validRect(node.window_rect)
        ? {
            x: node.rect.x + node.window_rect.x,
            y: node.rect.y + node.window_rect.y,
            width: node.window_rect.width,
            height: node.window_rect.height,
          }
        : node.rect
      const visible = node.visible !== false
      const focused = node.focused === true
      const level = confidence(visible, focused)
      const mode = displayMode(node.shell)
      const identity = `sway:${node.id ?? `anon-${order}`}`
      candidates.push({
        info: {
          bounds: content,
          logical: true,
          mode,
          fullscreen: (node.fullscreen_mode ?? 0) > 0,
          outputs: typeof nextOutput === 'string' ? [nextOutput] : [],
          identity,
          confidence: level,
          identityScore: match.score,
          detail: detailOf(node, mode, content, nextOutput, level, match),
        },
        // Identity outranks focus: a focused Steam window can borrow the game
        // title, while the real game may be hidden or on another output.
        rank: match.score * 10 + (focused && visible ? 4 : focused ? 3 : visible ? 2 : 1),
        order: order++,
      })
    }

    for (const child of [...(node.nodes ?? []), ...(node.floating_nodes ?? [])]) visit(child, nextOutput)
  }

  visit(root as SwayNode, undefined)
  candidates.sort((a, b) => b.rank - a.rank || a.order - b.order)
  const pinned = preferredIdentity
    ? candidates.find((candidate) => candidate.info.identity === preferredIdentity)
    : null
  return (pinned ?? candidates[0])?.info ?? null
}

/**
 * Exact geometry for Sway, including XWayland games whose X11 coordinates do
 * not share layer-shell's origin. `preferredIdentity` keeps the selected node
 * stable when several windows share the game title across outputs.
 */
export async function readSwayWindowInfo(
  titles: readonly string[],
  env: PlatformEnv = currentEnv(),
  preferredIdentity?: string,
  onError?: (error: unknown) => void,
): Promise<WindowGeometryInfo | null> {
  if (!titles.length) return null
  try {
    const { stdout } = await execFileAsync('swaymsg', ['-t', 'get_tree'], {
      encoding: 'utf8',
      timeout: 750,
      env: env.env,
    })
    return parseSwayTree(stdout, titles, preferredIdentity)
  } catch (error) {
    onError?.(error)
    return null
  }
}

export function createSwayGeometryProvider(env: PlatformEnv = currentEnv()): WindowGeometryProvider {
  /** Only pin a node Sway explicitly marks focused. Until then, keep
   *  re-evaluating so a stale hidden window cannot trap the overlay. */
  let pinnedIdentity: string | null = null
  let lastIdentity: string | null = null
  let lastFailure: string | null = null

  return {
    id: 'sway',
    reportSource: 'sway',
    read: async (titles) => {
      const info = await readSwayWindowInfo(titles, env, pinnedIdentity ?? undefined, (error) => {
        const message = String(error)
        if (message === lastFailure) return
        lastFailure = message
        reportBreadcrumb(`sway geometry IPC failed error=${message}`, 'debug')
      })

      if (!info) {
        if (lastFailure === null) {
          lastFailure = 'no-match'
          reportBreadcrumb(`sway geometry no match titles=${JSON.stringify(titles)}`, 'debug')
        }
        return null
      }
      lastFailure = null

      const identity = info.identity ?? null
      if (identity !== lastIdentity) {
        lastIdentity = identity
        reportBreadcrumb(`sway geometry candidate ${info.detail ?? `identity=${identity ?? '-'}`}`, 'debug')
      }
      if (pinnedIdentity && identity !== pinnedIdentity) {
        reportBreadcrumb(`sway geometry pin lost old=${pinnedIdentity} new=${identity ?? '-'}`, 'debug')
        pinnedIdentity = null
      }
      // A title-only match can be a launcher borrowing the game name. Only a
      // strong identity (executable/app id/class) is safe to pin across polls.
      if (info.confidence === 'focused' && (info.identityScore ?? 0) >= 4 && identity && pinnedIdentity !== identity) {
        pinnedIdentity = identity
        reportBreadcrumb(`sway geometry pinned identity=${identity} score=${info.identityScore}`, 'debug')
      }
      return info
    },
  }
}
