/* Reference implementation from poe2.re/src/lib/GenerateRarityRegex.ts. Verbatim copy
 * (semicolons/quoting differ - source formatting only), used as a parity reference only.
 * Do not refactor - drift from upstream is what the parity test catches. */
export interface RaritySettings {
  normal: boolean
  magic: boolean
  rare: boolean
}

/**
 * Generates a regex that matches item rarity.
 * The supported types are:
 *  Normal, Magic, Rare
 *
 * Example regex:
 *  Normal              ->  "y: n"
 *  Magic               ->  "y: m"
 *  Rare                ->  "y: r"
 *  Normal, Magic, Rare ->  null
 *
 * @param settings - Rarity settings (normal, magic, rare)
 * @returns Regex as string, null on failure
 */
export function generateRarityRegex(settings: RaritySettings): string | null {
  if ((settings.normal && settings.magic && settings.rare) || (!settings.normal && !settings.magic && !settings.rare)) {
    return null
  }
  const normalRegex = settings.normal ? 'n' : ''
  const magicRegex = settings.magic ? 'm' : ''
  const rareRegex = settings.rare ? 'r' : ''
  const result = [normalRegex, magicRegex, rareRegex].filter((e) => e.length > 0).join('|')

  if (result.length === 0) return null
  if (result.length === 1) return `"y: ${result}"`
  if (result.length > 1) return `"y: (${result})"`
  return null
}
