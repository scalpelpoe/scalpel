import { desktopCapturer, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import { reportBreadcrumb } from './diagnostics'
import { expectedGameVariants, matchesExpectedTitle, matchGameWindow } from './game-window-identity'
import type { GameWindowSource } from '../types'

type CapturerSource = { id: string; name: string }

/** Bonus for a source named exactly like the active title. Capture sources
 *  carry only a title, so a loose PoE-like name (`poe.ninja - Google Chrome`)
 *  can match as well as the game; the exact title must still win. */
const EXACT_TITLE_BONUS = 20

function scoreSource(source: CapturerSource, title: string, titles: readonly string[]): number {
  const exact = matchesExpectedTitle(source.name, [title]) ? EXACT_TITLE_BONUS : 0
  const match = matchGameWindow({ title: source.name }, titles)
  if (!match.accepted) return exact && 3
  const variants = expectedGameVariants(titles)
  const preferred = variants.length === 1 && match.variant === variants[0] ? 10 : 0
  return match.score + preferred + exact
}

function bestSource(sources: readonly CapturerSource[], title: string, titles: readonly string[]): string | null {
  let best: { id: string; score: number } | null = null
  for (const source of sources) {
    const score = scoreSource(source, title, titles)
    if (score > 0 && (!best || score > best.score)) best = { id: source.id, score }
  }
  return best?.id ?? null
}

/** Pick the desktopCapturer window source whose identity matches the game.
 *  Launcher/utility sources are rejected even when they borrow the game title. */
export function matchGameWindowSource(
  sources: readonly CapturerSource[],
  title: string,
  titles: readonly string[] = [title],
): string | null {
  return bestSource(sources, title, titles)
}

/** Source picker for callers that have no active title: use the best match from
 *  the known game titles without letting another variant win by title alone. */
export function matchBestGameWindowSource(
  sources: readonly CapturerSource[],
  titles: readonly string[],
): string | null {
  let best: { id: string; score: number } | null = null
  for (const title of titles) {
    const id = bestSource(sources, title, titles)
    if (!id) continue
    const source = sources.find((entry) => entry.id === id)
    if (!source) continue
    const score = scoreSource(source, title, titles)
    if (!best || score > best.score) best = { id, score }
  }
  return best?.id ?? null
}

export async function electronGameWindowSource(title: string): Promise<GameWindowSource | null> {
  const tb = OverlayController.targetBounds
  if (!tb?.width || !tb.height) return null
  try {
    // 1x1 thumbnail: we only need the source id, not its pixels (the renderer
    // opens the live stream from the id). This keeps getSources cheap.
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1, height: 1 } })
    const sourceId = matchGameWindowSource(sources, title)
    reportBreadcrumb(`screen-source title="${title}" resolved=${sourceId ?? '-'} of ${sources.length}`, 'debug')
    if (!sourceId) return null
    const display = screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 })
    const sf = display.scaleFactor
    return { sourceId, gameSize: { w: Math.round(tb.width / sf), h: Math.round(tb.height / sf) } }
  } catch (err) {
    reportBreadcrumb(`screen-source resolve failed error=${String(err)}`, 'debug')
    return null
  }
}
