import type { Zone } from '@shared/types'

const ZONE_PATTERN = /Generating level (\d+) area "([^"]+)"/

/** Parse a single Client.txt line. Returns the captured area level and area
 *  code on match, null otherwise. Lines with level 0 (cutscenes, login
 *  areas) also return null since they're not meaningful gameplay zones. */
export function parseClientLogLine(line: string): Zone | null {
  const m = ZONE_PATTERN.exec(line)
  if (!m) return null
  const areaLevel = Number(m[1])
  if (areaLevel <= 0) return null
  return { areaLevel, areaCode: m[2] }
}

/**
 * PoE logs this when an online filter is activated / finished loading in Options.
 * Config.ini often lags behind, so this is the live signal for game→app sync.
 *
 * Example:
 * `[Item Filter] Finished reloading online filter 38gBvaIX. Result: true. Hash: ...`
 */
const ONLINE_FILTER_RELOAD =
  /\[Item Filter\] Finished reloading online filter (\S+)\.\s*Result:\s*true/i

export function parseOnlineFilterReloadLine(line: string): string | null {
  const m = ONLINE_FILTER_RELOAD.exec(line)
  return m?.[1] ?? null
}
