import type { AdvancedMod } from '../../../shared/types'

/** Strip range annotations and parenthetical text from advanced mod lines */
function stripAdvModLines(lines: string[]): string[] {
  return lines
    .filter((l) => !l.startsWith('('))
    .map((l) =>
      l
        .replace(/(-?\d+(?:\.\d+)?)\(-?\d+(?:\.\d+)?(?:--?\d+(?:\.\d+)?)?\)/g, '$1')
        .replace(/([a-zA-Z]\w*)\s*\([^)]*\)/g, '$1')
        .replace(/\s*[—–-]+\s*Unscalable Value$/i, '')
        .trim(),
    )
    .filter(Boolean)
}

/** Find the advanced mod that matches a cleaned mod text (joined or individual line) */
function findAdvMod(
  advancedMods: AdvancedMod[],
  cleaned: string,
  typeFilter: 'implicit' | 'explicit',
  altCleaned?: string,
): AdvancedMod | undefined {
  return advancedMods.find((am) => {
    if (typeFilter === 'implicit' ? am.type !== 'implicit' : am.type === 'implicit') return false
    const stripped = stripAdvModLines(am.lines)
    return (
      stripped.join('\n') === cleaned ||
      stripped.some((l) => l === cleaned) ||
      (altCleaned && (stripped.join('\n') === altCleaned || stripped.some((l) => l === altCleaned)))
    )
  })
}

export { findAdvMod }
