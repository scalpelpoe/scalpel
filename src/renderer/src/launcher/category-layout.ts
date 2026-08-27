import type { LauncherItem } from '@shared/launcher'
import type { LauncherCategory } from '@shared/launcher-categories'
import { LAUNCHER_CATEGORY_LABELS, groupLauncherItems } from '@shared/launcher-categories'

export {
  categoryHubAngle,
  evenRingAngles,
  groupedRingLayout,
  minAngleForChip,
  polarPoint,
  twoTierChildSlots,
} from '@shared/launcher-layout'
export type { GroupedRingSlot, GroupedWedge, TwoTierChildSlot } from '@shared/launcher-layout'

export { groupLauncherItems, LAUNCHER_CATEGORY_LABELS }

export const CATEGORY_COLORS: Record<LauncherCategory, { fill: string; stroke: string; label: string }> = {
  reference: { fill: 'rgba(200, 169, 110, 0.22)', stroke: 'rgba(200, 169, 110, 0.55)', label: '#c8a96e' },
  devtools: { fill: 'rgba(94, 200, 216, 0.18)', stroke: 'rgba(94, 200, 216, 0.5)', label: '#5ec8d8' },
  app: { fill: 'rgba(120, 200, 140, 0.18)', stroke: 'rgba(120, 200, 140, 0.5)', label: '#78c88c' },
  toggles: { fill: 'rgba(180, 130, 220, 0.18)', stroke: 'rgba(180, 130, 220, 0.5)', label: '#b482dc' },
}

export function clusterArcPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
): string {
  const large = end - start > Math.PI ? 1 : 0
  const x1 = cx + Math.cos(start) * inner
  const y1 = cy + Math.sin(start) * inner
  const x2 = cx + Math.cos(end) * inner
  const y2 = cy + Math.sin(end) * inner
  const x3 = cx + Math.cos(end) * outer
  const y3 = cy + Math.sin(end) * outer
  const x4 = cx + Math.cos(start) * outer
  const y4 = cy + Math.sin(start) * outer
  return [
    `M ${x1} ${y1}`,
    `A ${inner} ${inner} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${outer} ${outer} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

import { groupedRingLayout } from '@shared/launcher-layout'

/** @deprecated use groupedRingLayout */
export function flatClusterItems(items: LauncherItem[]) {
  return groupedRingLayout(items).slots
}
