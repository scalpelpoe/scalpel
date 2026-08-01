import type { StatFilter } from '../../trade'

type WeaponItemInfo = {
  physDamageMin?: number
  physDamageMax?: number
  eleDamageAvg?: number
  chaosDamageAvg?: number
  attacksPerSecond?: number
  critChance?: number
}

// Add weapon DPS filters
export function buildWeaponDpsFilters(
  itemInfo: WeaponItemInfo | undefined,
  qualityNorm: number,
  pct: number,
): StatFilter[] {
  const out: StatFilter[] = []

  // Normalize physical damage to 20% quality (hoisted above aps gate so
  // the Damage chip can use them regardless of whether aps is present).
  const physAvg =
    itemInfo?.physDamageMin != null && itemInfo?.physDamageMax != null
      ? ((itemInfo.physDamageMin + itemInfo.physDamageMax) / 2) * qualityNorm
      : 0
  const eleAvg = itemInfo?.eleDamageAvg ?? 0
  const chaosAvg = itemInfo?.chaosDamageAvg ?? 0

  // Damage chip: total per-hit damage (no attack speed multiplier). Off by default.
  if (physAvg + eleAvg + chaosAvg > 0) {
    const damage = Math.round((physAvg + eleAvg + chaosAvg) * 10) / 10
    out.push({
      id: 'weapon.damage',
      text: `Damage: ${damage}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
      value: damage,
      min: Math.floor(damage * pct),
      max: null,
      enabled: false,
      type: 'weapon',
      aggregated: true,
    })
  }

  if (itemInfo?.attacksPerSecond) {
    const aps = itemInfo.attacksPerSecond
    const pdps = Math.round(physAvg * aps * 10) / 10
    const edps = Math.round(eleAvg * aps * 10) / 10
    const cdps = Math.round(chaosAvg * aps * 10) / 10
    const totalDps = Math.round((physAvg + eleAvg + chaosAvg) * aps * 10) / 10

    if (pdps > 0)
      out.push({
        id: 'weapon.pdps',
        text: `Physical DPS: ${pdps}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: pdps,
        min: Math.floor(pdps * pct),
        max: null,
        enabled: false,
        type: 'weapon',
        aggregated: true,
      })
    if (edps > 0)
      out.push({
        id: 'weapon.edps',
        text: `Elemental DPS: ${edps}`,
        value: edps,
        min: Math.floor(edps * pct),
        max: null,
        enabled: false,
        type: 'weapon',
        aggregated: true,
      })
    if (cdps > 0)
      out.push({
        id: 'weapon.cdps',
        text: `Chaos DPS: ${cdps}`,
        value: cdps,
        min: Math.floor(cdps * pct),
        max: null,
        enabled: false,
        type: 'weapon',
        aggregated: true,
      })
    if (totalDps > 0)
      out.push({
        id: 'weapon.dps',
        text: `Total DPS: ${totalDps}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: totalDps,
        min: Math.floor(totalDps * pct),
        max: null,
        enabled: true,
        type: 'weapon',
        aggregated: true,
      })

    // APS chip. One decimal is plenty of precision for search purposes.
    out.push({
      id: 'weapon.aps',
      text: `Attacks per Second: ${aps.toFixed(1)}`,
      value: aps,
      min: Math.floor(aps * pct * 10) / 10,
      max: null,
      enabled: false,
      type: 'weapon',
    })
  }

  // Critical strike chance chip (parsed from clipboard, independent of APS so it's
  // outside the `if (attacksPerSecond)` block).
  if (itemInfo?.critChance && itemInfo.critChance > 0) {
    const crit = itemInfo.critChance
    out.push({
      id: 'weapon.crit',
      text: `Critical Strike Chance: ${crit.toFixed(1)}%`,
      value: crit,
      min: Math.floor(crit * pct * 10) / 10,
      max: null,
      enabled: false,
      type: 'weapon',
    })
  }

  return out
}
