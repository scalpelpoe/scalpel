import type {
  FilterCondition,
  FilterFile,
  MatchResult,
  PoeItem,
  ConditionResult,
  EvaluatedCondition,
  StackSizeBreakpoint,
} from '../../shared/types'

// ─── Condition evaluators ─────────────────────────────────────────────────────

function compareNum(actual: number, op: string, target: number): boolean {
  switch (op) {
    case '>':
      return actual > target
    case '>=':
      return actual >= target
    case '=':
    case '==':
      return actual === target
    case '<=':
      return actual <= target
    case '<':
      return actual < target
    default:
      return false
  }
}

/** PoE uses substring matching for Class and BaseType */
function substringMatch(itemValue: string, filterValues: string[]): boolean {
  const lower = itemValue.toLowerCase()
  return filterValues.some((v) => lower.includes(v.toLowerCase()))
}

function exactMatchAny(itemValue: string, filterValues: string[]): boolean {
  const lower = itemValue.toLowerCase()
  return filterValues.some((v) => v.toLowerCase() === lower)
}

function evaluateCondition(cond: FilterCondition, item: PoeItem): ConditionResult {
  const { type, operator, values } = cond

  switch (type) {
    case 'Class':
      return (operator === '==' ? exactMatchAny(item.itemClass, values) : substringMatch(item.itemClass, values))
        ? 'pass'
        : 'fail'

    case 'BaseType':
      return (operator === '==' ? exactMatchAny(item.baseType, values) : substringMatch(item.baseType, values))
        ? 'pass'
        : 'fail'

    case 'Rarity': {
      // Rarity can use comparison operators: >= Magic, etc.
      const rarityOrder: Record<string, number> = { Normal: 0, Magic: 1, Rare: 2, Unique: 3 }
      if (operator === '=' || operator === '==') {
        return exactMatchAny(item.rarity, values) ? 'pass' : 'fail'
      }
      const actual = rarityOrder[item.rarity] ?? -1
      const target = rarityOrder[values[0]] ?? -1
      return actual >= 0 && target >= 0 && compareNum(actual, operator, target) ? 'pass' : 'fail'
    }

    case 'ItemLevel':
      return compareNum(item.itemLevel, operator, parseInt(values[0])) ? 'pass' : 'fail'

    case 'Quality':
      return compareNum(item.quality, operator, parseInt(values[0])) ? 'pass' : 'fail'

    case 'Sockets': {
      const socketCount = item.sockets ? item.sockets.replace(/[^RGBWAD]/g, '').length : 0
      return compareNum(socketCount, operator, parseInt(values[0])) ? 'pass' : 'fail'
    }

    case 'LinkedSockets':
      return compareNum(item.linkedSockets, operator, parseInt(values[0])) ? 'pass' : 'fail'

    case 'SocketGroup':
      return socketGroupMatches(item.sockets, values[0]) ? 'pass' : 'fail'

    case 'GemLevel':
      return compareNum(item.gemLevel, operator, parseInt(values[0])) ? 'pass' : 'fail'

    case 'StackSize':
      return compareNum(item.stackSize, operator, parseInt(values[0])) ? 'pass' : 'fail'

    case 'Corrupted':
      return boolMatch(item.corrupted, values[0]) ? 'pass' : 'fail'

    case 'Identified':
      return boolMatch(item.identified, values[0]) ? 'pass' : 'fail'

    case 'Mirrored':
      return boolMatch(item.mirrored, values[0]) ? 'pass' : 'fail'

    case 'Synthesised':
    case 'SynthesisedItem':
      return boolMatch(item.synthesised, values[0]) ? 'pass' : 'fail'

    case 'Fractured':
    case 'FracturedItem':
      return boolMatch(item.fractured, values[0]) ? 'pass' : 'fail'

    case 'Blighted':
    case 'BlightedMap':
      return boolMatch(item.blighted, values[0]) ? 'pass' : 'fail'

    case 'Scourged':
      return boolMatch(item.scourged, values[0]) ? 'pass' : 'fail'

    case 'AlternateQuality':
      return boolMatch(item.alternateQuality ?? false, values[0]) ? 'pass' : 'fail'

    case 'AnyEnchantment':
      return boolMatch((item.enchants?.length ?? 0) > 0, values[0]) ? 'pass' : 'fail'

    case 'HasExplicitMod': {
      // HasExplicitMod can check mod names (from advanced data) or mod text
      // With >= N operator, count how many mods from the list are present
      const threshold = operator !== '=' ? parseInt(values[0]) : 1
      const modNames = operator !== '=' ? values.slice(1) : values
      // Check advanced mod names first (prefix/suffix names like "Athlete's", "of the Leviathan")
      const advModNames = item.advancedMods?.filter((m) => m.type !== 'implicit').map((m) => m.name) ?? []
      const matchCount = modNames.filter(
        (v) =>
          advModNames.some((name) => name.toLowerCase().includes(v.toLowerCase())) ||
          item.explicits.some((mod) => mod.toLowerCase().includes(v.toLowerCase())),
      ).length
      return compareNum(matchCount, operator, threshold) ? 'pass' : 'fail'
    }

    case 'HasImplicitMod':
      return values.some((v) => item.implicits.some((mod) => mod.toLowerCase().includes(v.toLowerCase())))
        ? 'pass'
        : 'fail'

    case 'HasInfluence':
      return values.some((v) => item.influence.some((inf) => inf.toLowerCase() === v.toLowerCase())) ? 'pass' : 'fail'

    case 'UberBlighted':
    case 'UberBlightedMap':
      return boolMatch(item.uberBlighted ?? false, values[0]) ? 'pass' : 'fail'

    case 'Height':
      return item.height != null
        ? compareNum(item.height, operator, parseInt(values[0]))
          ? 'pass'
          : 'fail'
        : 'unknown'
    case 'Width':
      return item.width != null ? (compareNum(item.width, operator, parseInt(values[0])) ? 'pass' : 'fail') : 'unknown'

    case 'MapTier':
    case 'WaystoneTier':
      return item.mapTier > 0
        ? compareNum(item.mapTier, operator || '=', parseInt(values[0]))
          ? 'pass'
          : 'fail'
        : 'unknown'

    case 'Replica': {
      // Replica items always have "Replica" prefix in their name
      const isReplica = item.name.toLowerCase().startsWith('replica ')
      return boolMatch(isReplica, values[0]) ? 'pass' : 'fail'
    }

    case 'Imbued':
    case 'Foulborn': {
      // Imbued/Foulborn variants are identified by (mutated) mods
      const hasMutatedMod = item.explicits.some((m) => m.includes('(mutated)'))
      return boolMatch(hasMutatedMod, values[0]) ? 'pass' : 'fail'
    }

    case 'ZanaMemory':
      return boolMatch(item.zanaMemory, values[0]) ? 'pass' : 'fail'

    case 'MemoryStrands':
      // Items without memory strands have 0 strands (not unknown)
      return compareNum(item.memoryStrands ?? 0, operator, parseInt(values[0])) ? 'pass' : 'fail'

    case 'CorruptedMods':
      // Can't reliably distinguish corruption implicits from natural ones via clipboard
      return 'unknown'

    // Boolean conditions for defunct/league-specific mechanics -- safe to assume false
    case 'HasCruciblePassiveTree':
    case 'HasEaterOfWorldsImplicit':
    case 'HasSearingExarchImplicit':
    case 'HasEaterImplicit':
    case 'HasExarchImplicit':
    case 'TransfiguredGem':
    case 'ElderMap':
    case 'ShapedMap':
      return boolMatch(false, values[0]) ? 'pass' : 'fail'

    case 'EnchantmentPassiveNum':
    case 'EnchantmentPassiveNode':
      // Not available from clipboard data
      return 'unknown'

    // Conditions we can't evaluate from clipboard data
    case 'AreaLevel':
      if (item.areaLevel != null) return compareNum(item.areaLevel, operator, parseInt(values[0])) ? 'pass' : 'fail'
      return 'unknown'
    case 'DropLevel':
    case 'BaseArmour':
    case 'BaseEvasion':
    case 'BaseEnergyShield':
    case 'BaseWard':
      return 'unknown'

    default:
      return 'unknown'
  }
}

function boolMatch(actual: boolean, filterValue: string): boolean {
  return filterValue.toLowerCase() === (actual ? 'true' : 'false')
}

/** Check if item sockets contain a linked group satisfying the SocketGroup condition.
 *  e.g. sockets "R-G-B B-G", condition "RGB" → true */
function socketGroupMatches(sockets: string, groupPattern: string): boolean {
  if (!sockets) return false
  const groups = sockets.split(' ')
  const needed = groupPattern.toUpperCase().split('')
  const neededCounts = charCounts(needed)

  return groups.some((group) => {
    const colors = group.split('-')
    const have = charCounts(colors)
    return Object.entries(neededCounts).every(([c, count]) => (have[c] ?? 0) >= count)
  })
}

function charCounts(chars: string[]): Record<string, number> {
  return chars.reduce<Record<string, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1
    return acc
  }, {})
}

// ─── Block matching ───────────────────────────────────────────────────────────

export interface BlockEvaluation {
  matches: boolean
  evaluatedConditions: EvaluatedCondition[]
  hasUnknowns: boolean
}

export function evaluateBlock(block: { conditions: FilterCondition[] }, item: PoeItem): BlockEvaluation {
  const evaluatedConditions: EvaluatedCondition[] = block.conditions.map((cond) => ({
    condition: cond,
    result: evaluateCondition(cond, item),
  }))

  const hasAnyFail = evaluatedConditions.some((ec) => ec.result === 'fail')
  const hasAnyPass = evaluatedConditions.some((ec) => ec.result === 'pass')
  const hasUnknowns = evaluatedConditions.some((ec) => ec.result === 'unknown')

  // A block matches if:
  // - No condition definitively failed, AND
  // - At least one condition definitively passed (or the block has no conditions).
  // This prevents blocks with only unknown conditions from matching everything.
  const matches = !hasAnyFail && (hasAnyPass || evaluatedConditions.length === 0)
  return { matches, evaluatedConditions, hasUnknowns }
}

/** Find all blocks that match the item, in file order.
 *  Respects Continue — blocks with Continue keep searching even after matching.
 *  When strictUnknowns is true, blocks with any unknown condition are skipped —
 *  used for breakpoint analysis where we need definitive matches only. */
export function findMatchingBlocks(filter: FilterFile, item: PoeItem, strictUnknowns = false): MatchResult[] {
  const results: MatchResult[] = []
  let firstMatchFound = false
  let keepSearching = true

  for (let i = 0; i < filter.blocks.length && keepSearching; i++) {
    const block = filter.blocks[i]
    const evaluation = evaluateBlock(block, item)

    if (evaluation.matches && !(strictUnknowns && evaluation.hasUnknowns)) {
      // Continue blocks apply styling but aren't the "real" match
      const isFirstMatch = !firstMatchFound && !block.continue
      results.push({
        block,
        blockIndex: i,
        isFirstMatch,
        evaluatedConditions: evaluation.evaluatedConditions,
        hasUnknowns: evaluation.hasUnknowns,
      })

      if (isFirstMatch) {
        firstMatchFound = true
        keepSearching = false
      }
    }
  }

  return results
}

/**
 * For stackable items, find all StackSize thresholds in the filter and determine
 * which block is active at each stack size range.
 */
export function findStackSizeBreakpoints(filter: FilterFile, item: PoeItem): StackSizeBreakpoint[] {
  // Collect all StackSize threshold values from blocks that could match this item
  // (ignoring StackSize conditions)
  const thresholds = new Set<number>([1])

  for (const block of filter.blocks) {
    const hasStackSize = block.conditions.some((c) => c.type === 'StackSize')
    if (!hasStackSize) continue

    // Only collect thresholds from blocks whose non-StackSize conditions match this item
    const nonStackConds = block.conditions.filter((c) => c.type !== 'StackSize')
    const eval_ = evaluateBlock({ conditions: nonStackConds }, item)
    if (!eval_.matches && nonStackConds.length > 0) continue

    for (const cond of block.conditions) {
      if (cond.type === 'StackSize') {
        const val = parseInt(cond.values[0])
        if (!isNaN(val)) {
          // Add the threshold and one below it to capture range boundaries
          thresholds.add(val)
          if (val > 1) thresholds.add(val - 1)
        }
      }
    }
  }

  const sorted = Array.from(thresholds).sort((a, b) => a - b)
  const breakpoints: StackSizeBreakpoint[] = []

  for (let i = 0; i < sorted.length; i++) {
    const testSize = sorted[i]
    const testItem = { ...item, stackSize: testSize }
    const matches = findMatchingBlocks(filter, testItem, true)
    const activeMatch = matches.find((m) => m.isFirstMatch) ?? null

    // Merge with previous breakpoint if same active block
    const prev = breakpoints[breakpoints.length - 1]
    if (prev && sameActiveBlock(prev.activeMatch, activeMatch)) {
      prev.max = i < sorted.length - 1 ? sorted[i + 1] - 1 : Infinity
    } else {
      breakpoints.push({
        min: testSize,
        max: i < sorted.length - 1 ? sorted[i + 1] - 1 : Infinity,
        activeMatch,
      })
    }
  }

  return breakpoints
}

/**
 * For items with quality, find all Quality thresholds in the filter and determine
 * which block is active at each quality level range.
 */
export function findQualityBreakpoints(filter: FilterFile, item: PoeItem): StackSizeBreakpoint[] {
  const thresholds = new Set<number>([0])

  for (const block of filter.blocks) {
    const hasQuality = block.conditions.some((c) => c.type === 'Quality')
    if (!hasQuality) continue

    // Only collect thresholds from blocks whose non-Quality conditions match this item
    const nonQualityConds = block.conditions.filter((c) => c.type !== 'Quality')
    const eval_ = evaluateBlock({ conditions: nonQualityConds }, item)
    if (!eval_.matches && nonQualityConds.length > 0) continue

    for (const cond of block.conditions) {
      if (cond.type === 'Quality') {
        const val = parseInt(cond.values[0])
        if (!isNaN(val)) {
          thresholds.add(val)
          if (val > 0) thresholds.add(val - 1)
        }
      }
    }
  }

  const sorted = Array.from(thresholds).sort((a, b) => a - b)
  const breakpoints: StackSizeBreakpoint[] = []

  for (let i = 0; i < sorted.length; i++) {
    const testQuality = sorted[i]
    const testItem = { ...item, quality: testQuality }
    const matches = findMatchingBlocks(filter, testItem, true)
    const activeMatch = matches.find((m) => m.isFirstMatch) ?? null

    const prev = breakpoints[breakpoints.length - 1]
    if (prev && sameActiveBlock(prev.activeMatch, activeMatch)) {
      prev.max = i < sorted.length - 1 ? sorted[i + 1] - 1 : Infinity
    } else {
      breakpoints.push({
        min: testQuality,
        max: i < sorted.length - 1 ? sorted[i + 1] - 1 : Infinity,
        activeMatch,
      })
    }
  }

  return breakpoints
}

/**
 * For items with memory strands, find all MemoryStrands thresholds in the filter
 * and determine which block is active at each strand level range.
 */
export function findStrandBreakpoints(filter: FilterFile, item: PoeItem): StackSizeBreakpoint[] {
  const thresholds = new Set<number>([0])

  for (const block of filter.blocks) {
    const hasStrands = block.conditions.some((c) => c.type === 'MemoryStrands')
    if (!hasStrands) continue

    const nonStrandConds = block.conditions.filter((c) => c.type !== 'MemoryStrands')
    const eval_ = evaluateBlock({ conditions: nonStrandConds }, item)
    if (!eval_.matches && nonStrandConds.length > 0) continue

    for (const cond of block.conditions) {
      if (cond.type === 'MemoryStrands') {
        const val = parseInt(cond.values[0])
        if (!isNaN(val)) {
          thresholds.add(val)
          if (val > 0) thresholds.add(val - 1)
        }
      }
    }
  }

  const sorted = Array.from(thresholds).sort((a, b) => a - b)
  const breakpoints: StackSizeBreakpoint[] = []

  for (let i = 0; i < sorted.length; i++) {
    const testStrands = sorted[i]
    const testItem = { ...item, memoryStrands: testStrands }
    const matches = findMatchingBlocks(filter, testItem, true)
    const activeMatch = matches.find((m) => m.isFirstMatch) ?? null

    const prev = breakpoints[breakpoints.length - 1]
    if (prev && sameActiveBlock(prev.activeMatch, activeMatch)) {
      prev.max = i < sorted.length - 1 ? sorted[i + 1] - 1 : Infinity
    } else {
      breakpoints.push({
        min: testStrands,
        max: i < sorted.length - 1 ? sorted[i + 1] - 1 : Infinity,
        activeMatch,
      })
    }
  }

  return breakpoints
}

function sameActiveBlock(a: MatchResult | null, b: MatchResult | null): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.blockIndex === b.blockIndex
}

// Extend PoeItem to handle optional fields safely
declare module '../../shared/types' {
  interface PoeItem {
    alternateQuality?: boolean
    uberBlighted?: boolean
  }
}
