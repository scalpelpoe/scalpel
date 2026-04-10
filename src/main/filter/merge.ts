import { createHash } from 'crypto'
import type { FilterBlock, FilterCondition, FilterAction, FilterFile } from '../../shared/types'
import { parseFilterFile } from './parser'

// ─── Block Fingerprinting ─────────────────────────────────────────────────────

/**
 * Create a stable fingerprint for a block based on its conditions.
 * Conditions define WHAT a block matches (its identity), while actions define
 * HOW it displays (its appearance). Two blocks with the same conditions but
 * different actions are "the same block" for merge purposes.
 *
 * We also include the inline comment (which contains FilterBlade tier tags)
 * as a secondary identity signal, since some blocks have identical conditions
 * but different tier tags.
 */
export function fingerprintBlock(block: FilterBlock): string {
  const parts: string[] = []

  // Sort conditions by type for stability (order shouldn't matter for identity)
  const sortedConds = [...block.conditions].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    return a.operator.localeCompare(b.operator)
  })

  for (const cond of sortedConds) {
    // Sort values for set-like conditions (BaseType, Class) where order is irrelevant
    const values = isSetCondition(cond.type) ? [...cond.values].sort() : cond.values
    parts.push(`${cond.type}|${cond.operator}|${values.join(',')}`)
  }

  // Include inline comment as secondary identity (tier tags live here)
  if (block.inlineComment) {
    parts.push(`comment:${block.inlineComment}`)
  }

  return createHash('md5').update(parts.join('\n')).digest('hex')
}

/**
 * Lighter fingerprint that ignores BaseType values -- useful for matching
 * blocks where tier moves have shuffled BaseTypes between blocks but the
 * structural conditions (Class, ItemLevel, etc.) remain the same.
 */
export function fingerprintBlockStructure(block: FilterBlock): string {
  const parts: string[] = []

  const sortedConds = [...block.conditions]
    .filter((c) => c.type !== 'BaseType')
    .sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type)
      return a.operator.localeCompare(b.operator)
    })

  for (const cond of sortedConds) {
    const values = isSetCondition(cond.type) ? [...cond.values].sort() : cond.values
    parts.push(`${cond.type}|${cond.operator}|${values.join(',')}`)
  }

  if (block.inlineComment) {
    parts.push(`comment:${block.inlineComment}`)
  }

  return createHash('md5').update(parts.join('\n')).digest('hex')
}

/** Conditions where value order doesn't matter */
function isSetCondition(type: string): boolean {
  return ['BaseType', 'Class', 'HasExplicitMod', 'HasImplicitMod'].includes(type)
}

// ─── Action Diffing ───────────────────────────────────────────────────────────

/** Serialize an action to a comparable string */
function actionKey(action: FilterAction): string {
  return `${action.type}:${action.values.join(',')}`
}

/** Get a map of action type -> action for a block */
function actionMap(block: FilterBlock): Map<string, FilterAction> {
  const map = new Map<string, FilterAction>()
  for (const a of block.actions) {
    map.set(a.type, a)
  }
  return map
}

/**
 * Compare two blocks' actions and return which action types differ.
 */
function diffActions(a: FilterBlock, b: FilterBlock): Set<string> {
  const changed = new Set<string>()
  const aMap = actionMap(a)
  const bMap = actionMap(b)

  for (const [type, action] of aMap) {
    const bAction = bMap.get(type)
    if (!bAction || actionKey(action) !== actionKey(bAction)) {
      changed.add(type)
    }
  }

  for (const type of bMap.keys()) {
    if (!aMap.has(type)) changed.add(type)
  }

  return changed
}

/** Check if two conditions are equal */
function conditionsEqual(a: FilterCondition, b: FilterCondition): boolean {
  if (a.type !== b.type || a.operator !== b.operator) return false
  if (a.values.length !== b.values.length) return false
  const aVals = isSetCondition(a.type) ? [...a.values].sort() : a.values
  const bVals = isSetCondition(b.type) ? [...b.values].sort() : b.values
  return aVals.every((v, i) => v === bVals[i])
}

/** Check if two blocks have identical conditions */
function conditionsSame(a: FilterBlock, b: FilterBlock): boolean {
  if (a.conditions.length !== b.conditions.length) return false
  const aSorted = [...a.conditions].sort((x, y) => x.type.localeCompare(y.type))
  const bSorted = [...b.conditions].sort((x, y) => x.type.localeCompare(y.type))
  return aSorted.every((c, i) => conditionsEqual(c, bSorted[i]))
}

// ─── Block Matching ───────────────────────────────────────────────────────────

interface BlockMatch {
  oldIndex: number
  newIndex: number
  matchType: 'exact' | 'structural' | 'tierTag'
}

/**
 * Match blocks between two parsed filter files.
 * Uses a cascade of matching strategies from most to least precise.
 */
function matchBlocks(
  oldBlocks: FilterBlock[],
  newBlocks: FilterBlock[],
): {
  matched: BlockMatch[]
  unmatchedOld: number[]
  unmatchedNew: number[]
} {
  const matched: BlockMatch[] = []
  const usedOld = new Set<number>()
  const usedNew = new Set<number>()

  // Pass 1: Exact fingerprint match
  const oldFingerprints = oldBlocks.map(fingerprintBlock)
  const newFingerprints = newBlocks.map(fingerprintBlock)

  for (let ni = 0; ni < newBlocks.length; ni++) {
    if (usedNew.has(ni)) continue
    for (let oi = 0; oi < oldBlocks.length; oi++) {
      if (usedOld.has(oi)) continue
      if (newFingerprints[ni] === oldFingerprints[oi]) {
        matched.push({ oldIndex: oi, newIndex: ni, matchType: 'exact' })
        usedOld.add(oi)
        usedNew.add(ni)
        break
      }
    }
  }

  // Pass 2: Structural match (ignoring BaseType values)
  const oldStructural = oldBlocks.map(fingerprintBlockStructure)
  const newStructural = newBlocks.map(fingerprintBlockStructure)

  for (let ni = 0; ni < newBlocks.length; ni++) {
    if (usedNew.has(ni)) continue
    for (let oi = 0; oi < oldBlocks.length; oi++) {
      if (usedOld.has(oi)) continue
      if (newStructural[ni] === oldStructural[oi]) {
        matched.push({ oldIndex: oi, newIndex: ni, matchType: 'structural' })
        usedOld.add(oi)
        usedNew.add(ni)
        break
      }
    }
  }

  // Pass 3: TierTag match
  for (let ni = 0; ni < newBlocks.length; ni++) {
    if (usedNew.has(ni)) continue
    const newTag = newBlocks[ni].tierTag
    if (!newTag) continue
    for (let oi = 0; oi < oldBlocks.length; oi++) {
      if (usedOld.has(oi)) continue
      const oldTag = oldBlocks[oi].tierTag
      if (!oldTag) continue
      if (newTag.typePath === oldTag.typePath && newTag.tier === oldTag.tier) {
        matched.push({ oldIndex: oi, newIndex: ni, matchType: 'tierTag' })
        usedOld.add(oi)
        usedNew.add(ni)
        break
      }
    }
  }

  const unmatchedOld = oldBlocks.map((_, i) => i).filter((i) => !usedOld.has(i))
  const unmatchedNew = newBlocks.map((_, i) => i).filter((i) => !usedNew.has(i))

  return { matched, unmatchedOld, unmatchedNew }
}

// ─── Raw Line Helpers ─────────────────────────────────────────────────────────

/** Extract the raw lines for a block from its source file (including leading comment) */
function getRawBlockLines(file: FilterFile, block: FilterBlock): string[] {
  const start = block.leadingComment
    ? block.lineStart - block.leadingComment.split('\n').length - 1
    : block.lineStart - 1
  return file.rawLines.slice(start, block.lineEnd)
}

/** Get the raw lines between the end of one block and the start of the next */
function getGapLines(file: FilterFile, afterBlockIndex: number, beforeBlockIndex: number): string[] {
  if (afterBlockIndex < 0) {
    // Gap before the first block
    const nextBlock = file.blocks[beforeBlockIndex]
    const nextStart = nextBlock.leadingComment
      ? nextBlock.lineStart - nextBlock.leadingComment.split('\n').length - 1
      : nextBlock.lineStart - 1
    return file.rawLines.slice(0, nextStart)
  }
  const prevBlock = file.blocks[afterBlockIndex]
  const nextBlock = file.blocks[beforeBlockIndex]
  const nextStart = nextBlock.leadingComment
    ? nextBlock.lineStart - nextBlock.leadingComment.split('\n').length - 1
    : nextBlock.lineStart - 1
  return file.rawLines.slice(prevBlock.lineEnd, nextStart)
}

/** Get trailing lines after the last block */
function getTrailingLines(file: FilterFile): string[] {
  if (file.blocks.length === 0) return [...file.rawLines]
  const lastBlock = file.blocks[file.blocks.length - 1]
  return file.rawLines.slice(lastBlock.lineEnd)
}

/**
 * Detect the indentation style used in a file (tab or spaces).
 * Returns the indent string used.
 */
function detectIndent(rawLines: string[]): string {
  for (const line of rawLines) {
    if (line.startsWith('\t')) return '\t'
    const match = line.match(/^( {2,})/)
    if (match) return match[1]
  }
  return '\t'
}

/** Serialize a merged block using the indentation from the source file */
function serializeBlock(block: FilterBlock, indent: string): string[] {
  const lines: string[] = []

  if (block.leadingComment) {
    lines.push(block.leadingComment)
  }

  const commentSuffix = block.inlineComment ? ' # ' + block.inlineComment : ''
  lines.push(block.visibility + commentSuffix)

  for (const cond of block.conditions) {
    const numericConditions = new Set([
      'ItemLevel',
      'AreaLevel',
      'DropLevel',
      'Quality',
      'Sockets',
      'LinkedSockets',
      'GemLevel',
      'StackSize',
      'WaystoneTier',
      'BaseArmour',
      'BaseEvasion',
      'BaseEnergyShield',
      'BaseWard',
    ])
    const emitOperator = numericConditions.has(cond.type) || cond.explicitOperator
    const valStr = cond.values.map((v) => (v.includes(' ') || v === '' ? `"${v}"` : v)).join(' ')
    if (emitOperator) {
      lines.push(`${indent}${cond.type} ${cond.operator} ${valStr}`)
    } else {
      lines.push(`${indent}${cond.type} ${valStr}`)
    }
  }

  for (const action of block.actions) {
    if (action.values.length === 0) continue
    const valStr = action.values.map((v) => (v.includes(' ') || v === '' ? `"${v}"` : v)).join(' ')
    lines.push(`${indent}${action.type}${valStr ? ' ' + valStr : ''}`)
  }

  if (block.continue) {
    lines.push(`${indent}Continue`)
  }

  return lines
}

// ─── Three-Way Merge ──────────────────────────────────────────────────────────

export interface MergeConflict {
  blockFingerprint: string
  description: string
  actionType: string
  userValue: FilterAction
  upstreamValue: FilterAction
  mergedBlockIndex: number
}

export interface MergeResult {
  content: string
  conflicts: MergeConflict[]
  stats: {
    unchanged: number
    upstreamOnly: number
    userOnly: number
    bothChanged: number
    added: number
    removed: number
  }
}

/**
 * Three-way merge of filter files.
 *
 * Key principle: use RAW LINES from the source files wherever possible,
 * only re-serializing blocks that were genuinely merged from both sides.
 * This preserves original formatting, indentation, quoting, and comments.
 */
export function mergeFilters(baseContent: string, userContent: string, upstreamContent: string): MergeResult {
  const base = parseFilterFile('base', baseContent)
  const user = parseFilterFile('user', userContent)
  const upstream = parseFilterFile('upstream', upstreamContent)

  const indent = detectIndent(upstream.rawLines)

  // Match blocks between base<->user and base<->upstream
  const baseToUser = matchBlocks(base.blocks, user.blocks)
  const baseToUpstream = matchBlocks(base.blocks, upstream.blocks)

  const baseToUserMap = new Map<number, number>()
  for (const m of baseToUser.matched) baseToUserMap.set(m.oldIndex, m.newIndex)

  const baseToUpstreamMap = new Map<number, number>()
  for (const m of baseToUpstream.matched) baseToUpstreamMap.set(m.oldIndex, m.newIndex)

  const stats = { unchanged: 0, upstreamOnly: 0, userOnly: 0, bothChanged: 0, added: 0, removed: 0 }
  const conflicts: MergeConflict[] = []

  // Build merged output using upstream's block order and inter-block content.
  // For each block, decide which source to take raw lines from.
  const outputLines: string[] = []

  for (let ui = 0; ui < upstream.blocks.length; ui++) {
    const upstreamBlock = upstream.blocks[ui]

    // Add inter-block gap from upstream (comments, blank lines between blocks)
    const gapLines = getGapLines(upstream, ui - 1, ui)
    outputLines.push(...gapLines)

    // Find corresponding base block
    const baseMatch = baseToUpstream.matched.find((m) => m.newIndex === ui)

    if (!baseMatch) {
      // New block added by upstream -- take raw lines from upstream
      outputLines.push(...getRawBlockLines(upstream, upstreamBlock))
      stats.added++
      continue
    }

    const baseIndex = baseMatch.oldIndex
    const baseBlock = base.blocks[baseIndex]
    const userIndex = baseToUserMap.get(baseIndex)

    if (userIndex === undefined) {
      // User doesn't have this block -- take upstream
      outputLines.push(...getRawBlockLines(upstream, upstreamBlock))
      stats.upstreamOnly++
      continue
    }

    const userBlock = user.blocks[userIndex]

    // Determine what changed on each side
    const userChangedActions = diffActions(baseBlock, userBlock)
    const upstreamChangedActions = diffActions(baseBlock, upstreamBlock)
    const userChangedVisibility = userBlock.visibility !== baseBlock.visibility
    const upstreamChangedVisibility = upstreamBlock.visibility !== baseBlock.visibility
    const userChangedConditions = !conditionsSame(baseBlock, userBlock)
    const upstreamChangedConditions = !conditionsSame(baseBlock, upstreamBlock)

    const userChanged = userChangedActions.size > 0 || userChangedVisibility || userChangedConditions
    const upstreamChanged = upstreamChangedActions.size > 0 || upstreamChangedVisibility || upstreamChangedConditions

    if (!userChanged && !upstreamChanged) {
      // Neither changed -- take raw lines from upstream (preserves formatting)
      outputLines.push(...getRawBlockLines(upstream, upstreamBlock))
      stats.unchanged++
      continue
    }

    if (!userChanged && upstreamChanged) {
      // Only upstream changed -- take raw lines from upstream
      outputLines.push(...getRawBlockLines(upstream, upstreamBlock))
      stats.upstreamOnly++
      continue
    }

    if (userChanged && !upstreamChanged) {
      // Only user changed -- take raw lines from user's file
      outputLines.push(...getRawBlockLines(user, userBlock))
      stats.userOnly++
      continue
    }

    // Both sides changed -- need to merge. This is the only case where we re-serialize.
    stats.bothChanged++

    const merged: FilterBlock = {
      ...upstreamBlock,
      actions: [...upstreamBlock.actions],
      conditions: [...upstreamBlock.conditions],
    }

    if (userChangedVisibility) {
      merged.visibility = userBlock.visibility
    }

    if (userChangedConditions && !upstreamChangedConditions) {
      merged.conditions = [...userBlock.conditions]
    }

    // Actions: merge per-action-type
    const _baseActions = actionMap(baseBlock)
    const userActions = actionMap(userBlock)
    const upstreamActions = actionMap(upstreamBlock)
    const mergedActions = new Map<string, FilterAction>()

    for (const [type, action] of upstreamActions) {
      mergedActions.set(type, action)
    }

    for (const type of userChangedActions) {
      const userAction = userActions.get(type)

      if (!upstreamChangedActions.has(type)) {
        // Only user changed this action
        if (userAction) {
          mergedActions.set(type, userAction)
        } else {
          mergedActions.delete(type)
        }
      } else {
        // Both changed the same action -- user wins
        if (userAction) {
          mergedActions.set(type, userAction)
        }

        const upstreamAction = upstreamActions.get(type)
        if (userAction && upstreamAction) {
          conflicts.push({
            blockFingerprint: fingerprintBlock(baseBlock),
            description: describeBlock(baseBlock),
            actionType: type,
            userValue: userAction,
            upstreamValue: upstreamAction,
            mergedBlockIndex: ui,
          })
        }
      }
    }

    merged.actions = Array.from(mergedActions.values())
    outputLines.push(...serializeBlock(merged, indent))
  }

  // Trailing content after the last block
  outputLines.push(...getTrailingLines(upstream))

  stats.removed = baseToUpstream.unmatchedOld.length

  return { content: outputLines.join('\n'), conflicts, stats }
}

/** Human-readable description of a block for conflict reporting */
function describeBlock(block: FilterBlock): string {
  const parts: string[] = []

  if (block.tierTag) {
    parts.push(`${block.tierTag.typePath} (${block.tierTag.tier})`)
  }

  const baseType = block.conditions.find((c) => c.type === 'BaseType')
  if (baseType && baseType.values.length <= 3) {
    parts.push(baseType.values.join(', '))
  }

  const itemClass = block.conditions.find((c) => c.type === 'Class')
  if (itemClass) {
    parts.push(`Class: ${itemClass.values.join(', ')}`)
  }

  return parts.join(' - ') || `Block at line ${block.lineStart}`
}
