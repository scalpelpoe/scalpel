import type { LauncherItem } from './launcher'
import { groupLauncherItems, type LauncherCategory } from './launcher-categories'

const CHIP = 44
/** Shared orbit radius — matches hub / classic spacing. */
export const LAUNCHER_RING_R = 148
export const LAUNCHER_OUTER_R = 176

/** Minimum radians between chip centers so circles do not overlap on a ring. */
export function minAngleForChip(radius: number, chipSize = CHIP, gap = 1.28): number {
  const safeR = Math.max(radius, chipSize)
  return gap * 2 * Math.asin(Math.min(1, chipSize / (2 * safeR)))
}

/** Even spacing on a full ring — same invariant as classic / hub layouts. */
export function evenRingAngles(count: number, startOffset = -Math.PI / 2): number[] {
  if (count <= 0) return []
  const step = (Math.PI * 2) / count
  return Array.from({ length: count }, (_, i) => startOffset + (i + 0.5) * step)
}

export function polarPoint(cx: number, cy: number, angle: number, radius: number): { x: number; y: number } {
  return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }
}

export type GroupedRingSlot = {
  item: LauncherItem
  angle: number
  category: LauncherCategory
  globalIndex: number
}

export type GroupedWedge = {
  category: LauncherCategory
  start: number
  end: number
}

/** Items evenly on the full ring; wedges tile edge-to-edge (no gaps). */
export function groupedRingLayout(items: LauncherItem[]): {
  slots: GroupedRingSlot[]
  wedges: GroupedWedge[]
} {
  const groups = groupLauncherItems(items)
  const angles = evenRingAngles(items.length)
  const step = items.length > 0 ? (Math.PI * 2) / items.length : 0
  const half = step / 2
  const slots: GroupedRingSlot[] = []
  let idx = 0
  for (const group of groups) {
    for (const item of group.items) {
      slots.push({
        item,
        angle: angles[idx],
        category: group.category,
        globalIndex: idx,
      })
      idx++
    }
  }

  const wedges = groups.map((group) => {
    const groupSlots = slots.filter((s) => s.category === group.category)
    const first = groupSlots[0]?.angle ?? 0
    const last = groupSlots[groupSlots.length - 1]?.angle ?? first
    return {
      category: group.category,
      start: first - half,
      end: last + half,
    }
  })

  return { slots, wedges }
}

export type TwoTierChildSlot = {
  item: LauncherItem
  angle: number
  x: number
  y: number
  index: number
}

/** Expanded category: tools evenly on the main ring (drill-down view). */
export function twoTierChildSlots(
  items: LauncherItem[],
  category: LauncherCategory,
  center: { x: number; y: number },
): TwoTierChildSlot[] {
  const group = groupLauncherItems(items).find((g) => g.category === category)
  if (!group || group.items.length === 0) return []
  const angles = evenRingAngles(group.items.length)
  return group.items.map((item, index) => ({
    item,
    angle: angles[index],
    index,
    ...polarPoint(center.x, center.y, angles[index], LAUNCHER_RING_R),
  }))
}

export function categoryHubAngle(index: number, total: number): number {
  return ((index + 0.5) / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
}
