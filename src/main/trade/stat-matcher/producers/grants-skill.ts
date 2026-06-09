import type { StatFilter } from '../../trade'
import { matchModToStat } from '../mod-matcher'

type GrantsSkillItemInfo = {
  grantedSkills?: string[]
}

// Strip "Level N " prefix from the granted-skill label so the level lives
// only in the scrub box, not in the chip text.
// e.g. "Grants Skill: Level 15 Runic Tempering" -> "Runic Tempering"
function skillName(line: string): string {
  return line.replace(/^Grants Skill:\s+Level \d+\s+/, '')
}

// One price-check chip per granted skill, disabled by default.
// Level is pre-dialed into the min box.
export function buildGrantsSkillFilters(itemInfo: GrantsSkillItemInfo | undefined): StatFilter[] {
  if (!itemInfo?.grantedSkills?.length) return []

  const out: StatFilter[] = []
  for (const line of itemInfo.grantedSkills) {
    const matched = matchModToStat(line, false, 'skill')
    if (!matched) continue
    const level = matched.value ?? 0
    out.push({
      id: matched.statId,
      text: `Grants Skill: ${skillName(line)}`,
      value: level,
      min: level,
      max: null,
      enabled: false,
      type: 'skill',
    })
  }
  return out
}
