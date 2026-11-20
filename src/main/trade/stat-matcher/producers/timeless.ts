import type { AdvancedMod } from '@shared/types'
import type { StatFilter } from '../../trade'

type TimelessItemInfo = {
  baseType?: string
}

// Every leader that indexes as explicit.pseudo_timeless_jewel_<name> on PoE1 trade,
// grouped by jewel. Sourced from the live /api/trade/data/stats catalog (3.30).
// The "Any Leader" chip searches the whole family, so this table - not the item
// text - is the source of truth: the advanced copy's "(min-max)" leader hints
// don't list every leader and aren't guaranteed to be valid trade ids.
const TIMELESS_FAMILIES: string[][] = [
  ['Kaom', 'Rakiata', 'Kiloava', 'Akoya'], // Lethal Pride
  ['Asenath', 'Nasima', 'Balbala', 'Deshret'], // Brutal Restraint
  ['Dominus', 'Avarius', 'Maxarius', 'Venarius'], // Militant Faith
  ['Cadiro', 'Victario', 'Caspiro', 'Chitus'], // Elegant Hubris
  ['Doryani', 'Xibaqua', 'Ahuana', 'Zerphi'], // Glorious Vanity
  ['Medved', 'Vorana', 'Uhtred'], // Heroic Tragedy
  ['Amanamu', 'Ulaman', 'Kurgal', 'Tecrod'], // "Subjugating # souls in the thrall of"
  ['Zorath'], // "Binding # souls to phylacteries to sustain"
]

const FAMILY_BY_LEADER = new Map<string, string[]>(
  TIMELESS_FAMILIES.flatMap((family) => family.map((leader) => [leader.toLowerCase(), family] as const)),
)

// Seed lines all end with the leader's name, optionally followed by the advanced
// copy's "(min-max)" hint: "...in the akhara of Nasima(Asenath-Balbala)".
const SEED_LINE = /(\d+)\D*?\b([A-Za-z]+)(?:\([^)]*\))?\s*$/

function parseSeedLine(line: string): { seed: number; leader: string } | null {
  // Drop "(500-8000)" style range hints so the seed is the first bare number.
  const seedMatch = line.replace(/\(\d+-\d+\)/g, '').match(/\b(\d+)\b/)
  const leaderMatch = line.match(SEED_LINE)
  if (!seedMatch || !leaderMatch) return null
  const leader = leaderMatch[2]
  if (!FAMILY_BY_LEADER.has(leader.toLowerCase())) return null
  return { seed: parseInt(seedMatch[1], 10), leader }
}

const statId = (leader: string): string => `explicit.pseudo_timeless_jewel_${leader.toLowerCase()}`

// Timeless jewel handling: two toggleable chips - "Any Leader" and specific leader
export function buildTimelessFilters(
  itemInfo: TimelessItemInfo | undefined,
  advancedMods: AdvancedMod[] | undefined,
  explicits: string[],
): StatFilter[] {
  if (itemInfo?.baseType !== 'Timeless Jewel') return []

  const candidates = [...(advancedMods ?? []).flatMap((am) => am.lines), ...explicits].filter(
    (l) => /\d/.test(l) && !/Passives in radius are Conquered/i.test(l),
  )
  let parsed: { seed: number; leader: string } | null = null
  for (const line of candidates) {
    parsed = parseSeedLine(line)
    if (parsed) break
  }
  if (!parsed) return []

  const { seed, leader } = parsed
  const family = FAMILY_BY_LEADER.get(leader.toLowerCase())!
  const canonical = family.find((l) => l.toLowerCase() === leader.toLowerCase())!
  const ordered = [canonical, ...family.filter((l) => l !== canonical)]

  return [
    // "Any Leader" chip (default on) - uses count group with all leaders
    {
      id: 'timeless-any',
      text: `${seed} Any Leader`,
      value: seed,
      min: seed,
      max: seed,
      enabled: true,
      type: 'timeless',
      timelessLeaders: ordered.map(statId),
    },
    // Specific leader chip (default off) - searches only this leader
    {
      id: statId(canonical),
      text: `${seed} ${canonical}`,
      value: seed,
      min: seed,
      max: seed,
      enabled: false,
      type: 'timeless',
    },
  ]
}
