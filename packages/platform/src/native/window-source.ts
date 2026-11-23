import { desktopCapturer, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import type { GameWindowSource } from '../types'

/** Pick the desktopCapturer window source whose title matches the active game.
 *  Exact match wins (so PoE1's "Path of Exile" never grabs PoE2's "Path of
 *  Exile 2"); falls back to a prefix match for windows with trailing text. */
export function matchGameWindowSource(sources: Array<{ id: string; name: string }>, title: string): string | null {
  const exact = sources.find((s) => s.name === title)
  if (exact) return exact.id
  // Prefix match: everything after the title must be whitespace only, so
  // "Path of Exile" never matches "Path of Exile 2" (the " 2" suffix is
  // non-whitespace).
  const prefix = sources.find((s) => {
    if (!s.name.startsWith(title)) return false
    return s.name.slice(title.length).trim() === ''
  })
  return prefix ? prefix.id : null
}

export async function electronGameWindowSource(title: string): Promise<GameWindowSource | null> {
  const tb = OverlayController.targetBounds
  if (!tb?.width || !tb.height) return null
  try {
    // 1x1 thumbnail: we only need the source id, not its pixels (the renderer
    // opens the live stream from the id). This keeps getSources cheap.
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1, height: 1 } })
    const sourceId = matchGameWindowSource(sources, title)
    if (process.env.SCALPEL_DEBUG_LOG) {
      console.log(`[screen-source] title="${title}" resolved=${sourceId} of ${sources.length} sources`)
    }
    if (!sourceId) return null
    const display = screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 })
    const sf = display.scaleFactor
    return { sourceId, gameSize: { w: Math.round(tb.width / sf), h: Math.round(tb.height / sf) } }
  } catch (err) {
    if (process.env.SCALPEL_DEBUG_LOG) console.error('[screen-source] resolve failed', err)
    return null
  }
}
