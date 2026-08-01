/** Faithful port of poe2.re's generateRarityRegex (src/lib/GenerateRarityRegex.ts).
 *  Shared by the tablet and waystone engines. Output: `"y: n"`, `"y: (n|m)"`, ...;
 *  all-three-or-none selected -> null (no constraint). */
export interface RaritySettings {
  normal: boolean
  magic: boolean
  rare: boolean
}

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
  return `"y: (${result})"`
}
