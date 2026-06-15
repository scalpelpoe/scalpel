import { getPoeVersion } from '@main/game-state'
import type { StatFilter } from '../../trade'

// Add defense filters as special "defence" type
export function buildDefenseFilters(
  defenses: { armour: number; evasion: number; energyShield: number; ward: number; block: number } | undefined,
  qualityNorm: number,
  pct: number,
): StatFilter[] {
  const out: StatFilter[] = []
  if (defenses) {
    const ar = Math.round(defenses.armour * qualityNorm)
    const ev = Math.round(defenses.evasion * qualityNorm)
    const es = Math.round(defenses.energyShield * qualityNorm)
    if (ar > 0)
      out.push({
        id: 'defence.armour',
        text: `Armour: ${ar}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: ar,
        min: Math.floor(ar * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
    if (ev > 0)
      out.push({
        id: 'defence.evasion',
        text: `Evasion: ${ev}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: ev,
        min: Math.floor(ev * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
    if (es > 0)
      out.push({
        id: 'defence.energy_shield',
        text: `Energy Shield: ${es}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: es,
        min: Math.floor(es * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
    const wardLabel = getPoeVersion() === 2 ? 'Runic Ward' : 'Ward'
    const wd = Math.round(defenses.ward * qualityNorm)
    if (wd > 0)
      out.push({
        id: 'defence.ward',
        text: `${wardLabel}: ${wd}${qualityNorm > 1 ? ' (20 quality)' : ''}`,
        value: wd,
        min: Math.floor(wd * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
    if (defenses.block > 0)
      out.push({
        id: 'defence.block',
        text: `Block: ${defenses.block}%`,
        value: defenses.block,
        min: Math.floor(defenses.block * pct),
        max: null,
        enabled: true,
        type: 'defence',
      })
  }
  return out
}
