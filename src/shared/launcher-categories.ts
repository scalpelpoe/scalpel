import type { LauncherItem } from './launcher'

/** Tool groupings for clustered launcher layouts. */
export type LauncherCategory = 'reference' | 'devtools' | 'app' | 'toggles'

export const LAUNCHER_CATEGORIES: ReadonlyArray<LauncherCategory> = ['reference', 'devtools', 'app', 'toggles']

export function isLauncherCategory(value: unknown): value is LauncherCategory {
  return value === 'reference' || value === 'devtools' || value === 'app' || value === 'toggles'
}

export const LAUNCHER_CATEGORY_LABELS: Record<LauncherCategory, string> = {
  reference: 'Reference',
  devtools: 'Dev tools',
  app: 'App',
  toggles: 'Toggles',
}

const BUILTIN_CATEGORY: Record<string, LauncherCategory> = {
  openSettings: 'app',
  toggleWhiteboard: 'devtools',
  toggleRegexRemote: 'devtools',
  toggleCheatSheets: 'reference',
  openRegex: 'devtools',
  openAudit: 'devtools',
  openDust: 'reference',
  openDivCards: 'reference',
}

/** Infer category from built-in action or plugin overlay id/label. */
export function launcherCategoryForItem(action: string, label: string): LauncherCategory {
  if (action.startsWith('plugin-overlay:')) {
    const pluginId = action.slice('plugin-overlay:'.length)
    const hay = `${pluginId} ${label}`.toLowerCase()
    if (/strat|meta|quest|history|cheat|guide|timeless|advisor|poe2/.test(hay)) return 'reference'
    if (/regex|audit|whiteboard|remote/.test(hay)) return 'devtools'
    if (/dps|lab|overlay|toggle/.test(hay)) return 'toggles'
    return 'app'
  }
  return BUILTIN_CATEGORY[action] ?? 'app'
}

export type LauncherCategoryGroup = {
  category: LauncherCategory
  items: LauncherItem[]
}

/** Stable category order for ring layouts. */
export function groupLauncherItems(items: LauncherItem[]): LauncherCategoryGroup[] {
  const buckets = new Map<LauncherCategory, LauncherItem[]>()
  for (const cat of LAUNCHER_CATEGORIES) buckets.set(cat, [])
  for (const item of items) {
    const category = item.category ?? launcherCategoryForItem(item.action, item.label)
    buckets.get(category)?.push(item)
  }
  return LAUNCHER_CATEGORIES.filter((c) => (buckets.get(c)?.length ?? 0) > 0).map((category) => ({
    category,
    items: buckets.get(category) ?? [],
  }))
}

export type ClusterLayout = {
  category: LauncherCategory
  start: number
  end: number
  itemAngles: number[]
}

/** Even clusters with fixed gaps; angles in radians, 0 = east, counter-clockwise from standard math. */
export function layoutCategoryClusters(
  groups: ReadonlyArray<{ category: LauncherCategory; count: number }>,
  gapRad = 0.08,
  startOffset = -Math.PI / 2,
): ClusterLayout[] {
  const totalItems = groups.reduce((n, g) => n + g.count, 0)
  if (totalItems <= 0) return []
  const gapTotal = gapRad * Math.max(groups.length, 1)
  const span = Math.PI * 2 - gapTotal
  let cursor = startOffset + gapRad / 2
  return groups.map((group) => {
    const slice = (group.count / totalItems) * span
    const start = cursor
    const end = cursor + slice
    const itemAngles: number[] = []
    for (let i = 0; i < group.count; i++) {
      itemAngles.push(start + ((i + 0.5) / group.count) * slice)
    }
    cursor = end + gapRad
    return { category: group.category, start, end, itemAngles }
  })
}
