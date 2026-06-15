import { getPoeVersion } from '@main/game-state'
import type { StatFilter } from '../../trade'

type HeistItemInfo = {
  heistJob?: { skill: string; level: number }
  monsterLevel?: number
  wingsRevealed?: number
  wingsTotal?: number
  itemClass?: string
  baseType?: string
}

// Heist job skill requirement (contracts only; blueprints have multiple jobs that don't filter search)
// Area level chip (for heist contracts/blueprints)
// Heist blueprint wings revealed
export function buildHeistFilters(itemInfo: HeistItemInfo | undefined): StatFilter[] {
  const out: StatFilter[] = []

  if (itemInfo?.heistJob && itemInfo.itemClass === 'Contracts') {
    const skillKey = itemInfo.heistJob.skill.toLowerCase().replace(/\s+/g, '_')
    out.push({
      id: `heist.heist_${skillKey}`,
      text: `Requires ${itemInfo.heistJob.skill} (Level ${itemInfo.heistJob.level})`,
      value: itemInfo.heistJob.level,
      min: 1,
      max: null,
      enabled: true,
      type: 'heist',
    })
  }

  // Area level chip (for heist contracts/blueprints)
  if (itemInfo?.monsterLevel && itemInfo.itemClass !== 'Maps' && itemInfo.itemClass !== 'Sanctum Research') {
    // Both PoE2 trial keys (Djinn Barya and Inscribed Ultimatum) render as an
    // editable row with both ends pinned - within an ascendancy bracket a LOWER
    // area level is worth more, so an open-ended min lumps the item in with
    // cheaper higher-level listings (#433). PoE1 ultimatums scale the other way
    // and keep the min-only misc chip. All other items use min-only chip.
    const isPoe2TrialKey =
      getPoeVersion() === 2 && (itemInfo.baseType === 'Djinn Barya' || itemInfo.baseType === 'Inscribed Ultimatum')
    out.push({
      id: 'misc.area_level',
      text: `Area Level: ${itemInfo.monsterLevel}`,
      value: itemInfo.monsterLevel,
      min: itemInfo.monsterLevel,
      max: isPoe2TrialKey ? itemInfo.monsterLevel : null,
      enabled: true,
      type: isPoe2TrialKey ? 'pseudo' : 'misc',
    })
  }

  // Heist blueprint wings revealed
  if (itemInfo?.wingsRevealed != null) {
    out.push({
      id: 'heist.heist_wings',
      text: `Wings Revealed: ${itemInfo.wingsRevealed}`,
      value: itemInfo.wingsRevealed,
      min: itemInfo.wingsRevealed,
      max: null,
      enabled: true,
      type: 'heist',
    })
    if (itemInfo.wingsTotal) {
      out.push({
        id: 'heist.heist_max_wings',
        text: `Total Wings: ${itemInfo.wingsTotal}`,
        value: itemInfo.wingsTotal,
        min: itemInfo.wingsTotal,
        max: null,
        enabled: true,
        type: 'heist',
      })
    }
  }

  return out
}
