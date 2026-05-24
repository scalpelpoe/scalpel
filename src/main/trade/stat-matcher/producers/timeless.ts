import type { AdvancedMod } from '../../../../shared/types'
import type { StatFilter } from '../../trade'

type TimelessItemInfo = {
  baseType?: string
}

// Timeless jewel handling: two toggleable chips - "Any Leader" and specific leader
export function buildTimelessFilters(
  itemInfo: TimelessItemInfo | undefined,
  advancedMods: AdvancedMod[] | undefined,
  explicits: string[],
): StatFilter[] {
  const out: StatFilter[] = []

  if (itemInfo?.baseType !== 'Timeless Jewel') return out

  let seed: number | null = null
  let currentLeader: string | null = null
  let allLeaders: string[] = []

  if (advancedMods) {
    // Advanced mod format (Ctrl+Alt+C): "Carved to glorify 5972(2000-10000) new faithful converted by High Templar Dominus(Avarius-Maxarius)"
    const timelessMod = advancedMods.find((am) => am.lines.some((l) => /Passives in radius are Conquered/i.test(l)))
    if (timelessMod) {
      const leaderLine = timelessMod.lines.find((l) => /\d/.test(l))
      if (leaderLine) {
        const seedMatch = leaderLine.match(/(\d+)\(\d+-\d+\)/)
        seed = seedMatch ? parseInt(seedMatch[1], 10) : null
        const leaderMatch = leaderLine.match(/(\w+)\(([^)]+)\)\s*$/)
        if (leaderMatch) {
          currentLeader = leaderMatch[1]
          const alternatives = leaderMatch[2].split('-')
          allLeaders = [...new Set([currentLeader, ...alternatives])]
        }
      }
    }
  }

  if (!seed) {
    // Plain text format (Ctrl+C): "Remembrancing 2724 songworthy deeds by the line of Medved"
    const remembrancingLine = explicits.find((l) => /^Remembrancing/i.test(l))
    if (remembrancingLine) {
      const seedMatch = remembrancingLine.match(/Remembrancing (\d+)/)
      seed = seedMatch ? parseInt(seedMatch[1], 10) : null
      const leaderMatch = remembrancingLine.match(/by the line of (\w+)/i)
      if (leaderMatch) {
        currentLeader = leaderMatch[1]
        allLeaders = ['Medved', 'Vorana', 'Uhtred']
      }
    }
  }

  if (!seed) {
    // Plain text format for other timeless jewels: "Bathed 7421 tips of fingers and toes in the Precursor's blood by Doryani"
    const seedLine = explicits.find((l) => /Commanded|Commissioned|Carved|Bathed|Denoted/i.test(l))
    if (seedLine) {
      const seedMatch = seedLine.match(/\b(\d{4,5})\b/)
      seed = seedMatch ? parseInt(seedMatch[1], 10) : null
      const leaderMatch = seedLine.match(/by (?:High Templar |Victorious |)(\w+)\s*$/i)
      if (leaderMatch) {
        currentLeader = leaderMatch[1]
        // Determine alternatives based on known timeless jewel families
        const timelessFamilies: Record<string, string[]> = {
          Dominus: ['Dominus', 'Avarius', 'Maxarius'],
          Avarius: ['Dominus', 'Avarius', 'Maxarius'],
          Maxarius: ['Dominus', 'Avarius', 'Maxarius'],
          Doryani: ['Doryani', 'Xibaqua', 'Ahuana'],
          Xibaqua: ['Doryani', 'Xibaqua', 'Ahuana'],
          Ahuana: ['Doryani', 'Xibaqua', 'Ahuana'],
          Asenath: ['Asenath', 'Balbala', 'Nasima'],
          Balbala: ['Asenath', 'Balbala', 'Nasima'],
          Nasima: ['Asenath', 'Balbala', 'Nasima'],
          Cadiro: ['Cadiro', 'Victario', 'Caspiro'],
          Victario: ['Cadiro', 'Victario', 'Caspiro'],
          Caspiro: ['Cadiro', 'Victario', 'Caspiro'],
          Kaom: ['Kaom', 'Rakiata', 'Kiloava'],
          Rakiata: ['Kaom', 'Rakiata', 'Kiloava'],
          Kiloava: ['Kaom', 'Rakiata', 'Kiloava'],
        }
        allLeaders = timelessFamilies[currentLeader] ?? [currentLeader]
      }
    }
  }

  if (seed && currentLeader && allLeaders.length > 0) {
    const allStatIds = allLeaders.map((l) => `explicit.pseudo_timeless_jewel_${l.toLowerCase()}`)
    const currentStatId = `explicit.pseudo_timeless_jewel_${currentLeader.toLowerCase()}`

    // "Any Leader" chip (default on) - uses count group with all leaders
    out.push({
      id: 'timeless-any',
      text: `${seed} Any Leader`,
      value: seed,
      min: seed,
      max: seed,
      enabled: true,
      type: 'timeless',
      timelessLeaders: allStatIds,
    })
    // Specific leader chip (default off) - searches only this leader
    out.push({
      id: currentStatId,
      text: `${seed} ${currentLeader}`,
      value: seed,
      min: seed,
      max: seed,
      enabled: false,
      type: 'timeless',
    })
  }

  return out
}
