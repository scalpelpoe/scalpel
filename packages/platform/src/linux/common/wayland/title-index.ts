import { expectedGameVariants, PLATFORM_GAME_TITLES, type GameWindowMatch } from '../../../common/game-window-identity'

/** Map a matched compositor window back to the host's title slot.
 *
 * Native attach events carry a title index so the host can infer PoE1 vs PoE2.
 * A compositor window may have a launcher-decorated or custom title, so the
 * verified variant decides first; an exact or prefix title match is only a
 * fallback. */
export function gameTitleIndex(
  titles: readonly string[],
  title: string | null | undefined,
  match: GameWindowMatch,
): number {
  if (match.variant) {
    const canonical = titles.indexOf(PLATFORM_GAME_TITLES[match.variant])
    if (canonical >= 0) return canonical
    const custom = titles.findIndex((entry) => {
      const variants = expectedGameVariants([entry])
      return variants.length === 1 && variants[0] === match.variant
    })
    if (custom >= 0) return custom
  }
  const value = title?.toLowerCase() ?? ''
  const exact = titles.findIndex((entry) => entry.toLowerCase() === value)
  if (exact >= 0) return exact
  const prefix = titles.findIndex((entry) => value.startsWith(entry.toLowerCase()))
  return Math.max(0, prefix)
}
