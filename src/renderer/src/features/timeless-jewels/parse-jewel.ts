import type { JewelType } from './crystalline'

export interface ParsedTimelessJewel {
  jewelType: JewelType
  jewelName: string
  conqueror: string
  seed: number
}

/** Map conqueror name → jewel type (matches Vilsol data.TimelessJewelConquerors). */
export const CONQUEROR_TO_JEWEL: Record<string, { type: JewelType; name: string }> = {
  Xibaqua: { type: 1, name: 'Glorious Vanity' },
  Zerphi: { type: 1, name: 'Glorious Vanity' },
  Ahuana: { type: 1, name: 'Glorious Vanity' },
  Doryani: { type: 1, name: 'Glorious Vanity' },
  Kaom: { type: 2, name: 'Lethal Pride' },
  Rakiata: { type: 2, name: 'Lethal Pride' },
  Kiloava: { type: 2, name: 'Lethal Pride' },
  Akoya: { type: 2, name: 'Lethal Pride' },
  Deshret: { type: 3, name: 'Brutal Restraint' },
  Balbala: { type: 3, name: 'Brutal Restraint' },
  Asenath: { type: 3, name: 'Brutal Restraint' },
  Nasima: { type: 3, name: 'Brutal Restraint' },
  Venarius: { type: 4, name: 'Militant Faith' },
  Maxarius: { type: 4, name: 'Militant Faith' },
  Dominus: { type: 4, name: 'Militant Faith' },
  Avarius: { type: 4, name: 'Militant Faith' },
  Cadiro: { type: 5, name: 'Elegant Hubris' },
  Victario: { type: 5, name: 'Elegant Hubris' },
  Chitus: { type: 5, name: 'Elegant Hubris' },
  Caspiro: { type: 5, name: 'Elegant Hubris' },
  Vorana: { type: 6, name: 'Heroic Tragedy' },
  Uhtred: { type: 6, name: 'Heroic Tragedy' },
  Medved: { type: 6, name: 'Heroic Tragedy' },
}

const JEWEL_NAME_TO_TYPE: Record<string, JewelType> = {
  'Glorious Vanity': 1,
  'Lethal Pride': 2,
  'Brutal Restraint': 3,
  'Militant Faith': 4,
  'Elegant Hubris': 5,
  'Heroic Tragedy': 6,
}

/** Parse a Timeless Jewel from PoE clipboard text (Ctrl+C or Ctrl+Alt+C). */
export function parseTimelessJewelClipboard(text: string): ParsedTimelessJewel | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  let seed: number | null = null
  let conqueror: string | null = null

  // Advanced: "Carved to glorify 5972(2000-10000) new faithful converted by High Templar Dominus(Avarius-Maxarius)"
  for (const line of lines) {
    const adv = line.match(
      /(\d+)\(\d+-\d+\).*?\b(?:by (?:High Templar |Victorious |the line of )?)?(\w+)\([^)]+\)\s*$/i,
    )
    if (adv) {
      seed = parseInt(adv[1], 10)
      conqueror = adv[2]
      break
    }
  }

  // Heroic Tragedy: "Remembrancing 2724 songworthy deeds by the line of Medved"
  if (!seed) {
    for (const line of lines) {
      const m = line.match(/^Remembrancing (\d+).*by the line of (\w+)/i)
      if (m) {
        seed = parseInt(m[1], 10)
        conqueror = m[2]
        break
      }
    }
  }

  // Other plain: "Bathed 7421 … by Doryani" / Commanded / Commissioned / Carved / Denoted
  if (!seed) {
    for (const line of lines) {
      if (!/Commanded|Commissioned|Carved|Bathed|Denoted/i.test(line)) continue
      const seedMatch = line.match(/\b(\d{4,5})\b/)
      const leaderMatch = line.match(/by (?:High Templar |Victorious |the line of )?(\w+)\s*$/i)
      if (seedMatch && leaderMatch) {
        seed = parseInt(seedMatch[1], 10)
        conqueror = leaderMatch[1]
        break
      }
    }
  }

  if (seed == null || !conqueror) return null
  const mapped = CONQUEROR_TO_JEWEL[conqueror]
  if (!mapped) return null

  // Prefer unique name line if present ("Glorious Vanity")
  let jewelName = mapped.name
  let jewelType = mapped.type
  for (const line of lines) {
    const t = JEWEL_NAME_TO_TYPE[line]
    if (t) {
      jewelName = line
      jewelType = t
      break
    }
  }

  return { jewelType, jewelName, conqueror, seed }
}
