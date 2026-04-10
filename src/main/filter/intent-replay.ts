// src/main/filter/intent-replay.ts
import { parseFilterFile } from './parser'
import type { FilterFile, FilterBlock, ComparisonOperator, ActionType } from '../../shared/types'
import type {
  Intent,
  IntentLog,
  MoveBaseTypePayload,
  SetVisibilityPayload,
  SetThresholdPayload,
  SetActionPayload,
} from './intents'

export interface ReplayConflict {
  intent: Intent
  description: string
  options: { label: string; action: 'keep-mine' | 'take-upstream' }[]
}

export interface ReplayResult {
  filter: FilterFile
  modifiedBlocks: Set<number>
  conflicts: ReplayConflict[]
  stats: {
    applied: number
    skipped: number
    conflicts: number
  }
}

function findBlockByTierTag(
  filter: FilterFile,
  typePath: string,
  tier: string,
): { block: FilterBlock; index: number } | null {
  for (let i = 0; i < filter.blocks.length; i++) {
    const b = filter.blocks[i]
    if (b.tierTag && b.tierTag.typePath === typePath && b.tierTag.tier === tier) {
      return { block: b, index: i }
    }
  }
  return null
}

function findBaseTypeInFilter(filter: FilterFile, value: string): { block: FilterBlock; index: number } | null {
  for (let i = 0; i < filter.blocks.length; i++) {
    const b = filter.blocks[i]
    for (const cond of b.conditions) {
      if (cond.type === 'BaseType' && cond.values.includes(value)) {
        return { block: b, index: i }
      }
    }
  }
  return null
}

export function replayIntents(
  upstreamContent: string,
  upstreamPath: string,
  intentLog: IntentLog,
  options?: { resolutions?: Map<number, 'keep-mine' | 'take-upstream'>; forceApply?: boolean },
): ReplayResult {
  // Parse a working copy of the upstream filter
  const filter = parseFilterFile(upstreamPath, upstreamContent)
  const conflicts: ReplayConflict[] = []
  const modifiedBlocks = new Set<number>()
  let applied = 0
  let skipped = 0

  for (let i = 0; i < intentLog.intents.length; i++) {
    const intent = intentLog.intents[i]
    const { typePath, tier } = intent.target
    const match = findBlockByTierTag(filter, typePath, tier)

    if (!match) {
      conflicts.push({
        intent,
        description: `Target tier ${typePath}/${tier} no longer exists in the updated filter.`,
        options: [],
      })
      skipped++
      continue
    }

    // Check if user provided a resolution for this intent
    const resolution = options?.resolutions?.get(i)
    const forceApply = options?.forceApply ?? false

    if (intent.type === 'move-basetype') {
      const p = intent.payload as MoveBaseTypePayload
      const current = findBaseTypeInFilter(filter, p.value)

      if (!current) {
        conflicts.push({
          intent,
          description: `"${p.value}" no longer exists in the filter.`,
          options: [],
        })
        skipped++
        continue
      }

      // Check if upstream also moved it (it's not in fromTier anymore)
      const isInOriginalTier = current.block.tierTag?.tier === p.fromTier
      const isAlreadyInTarget = current.block.tierTag?.tier === tier && current.block.tierTag?.typePath === typePath

      if (isAlreadyInTarget) {
        // Already where we want it
        applied++
        continue
      }

      if (!isInOriginalTier && !resolution && !forceApply) {
        // Upstream moved it somewhere else - conflict
        const upstreamTier = current.block.tierTag?.tier ?? 'unknown'
        conflicts.push({
          intent,
          description: `"${p.value}" was moved to ${upstreamTier} by the filter update, but you had it in ${tier}.`,
          options: [
            { label: `Keep mine (${tier})`, action: 'keep-mine' },
            { label: `Take update (${upstreamTier})`, action: 'take-upstream' },
          ],
        })
        skipped++
        continue
      }

      if (resolution === 'take-upstream') {
        skipped++
        continue
      }

      // Apply the move: remove from current location, add to target
      // Remove from current block's BaseType condition
      for (const cond of current.block.conditions) {
        if (cond.type === 'BaseType') {
          cond.values = cond.values.filter((v) => v !== p.value)
        }
      }
      modifiedBlocks.add(current.index)
      // Add to target block's BaseType condition
      const targetBaseType = match.block.conditions.find((c) => c.type === 'BaseType')
      if (targetBaseType) {
        if (!targetBaseType.values.includes(p.value)) {
          targetBaseType.values.push(p.value)
        }
      } else {
        match.block.conditions.push({
          type: 'BaseType',
          operator: '==',
          values: [p.value],
          explicitOperator: true,
        })
      }
      modifiedBlocks.add(match.index)
      applied++
    } else if (intent.type === 'set-visibility') {
      const p = intent.payload as SetVisibilityPayload
      match.block.visibility = p.visibility
      modifiedBlocks.add(match.index)
      applied++
    } else if (intent.type === 'set-threshold') {
      const p = intent.payload as SetThresholdPayload
      const cond = match.block.conditions.find((c) => c.type === p.condition)
      if (cond) {
        cond.operator = p.operator as ComparisonOperator
        cond.values = [String(p.value)]
      }
      modifiedBlocks.add(match.index)
      applied++
    } else if (intent.type === 'set-action') {
      const p = intent.payload as SetActionPayload
      if (p.values.length === 0) {
        // Remove the action
        match.block.actions = match.block.actions.filter((a) => a.type !== p.action)
      } else {
        const existing = match.block.actions.find((a) => a.type === p.action)
        if (existing) {
          existing.values = p.values
        } else {
          match.block.actions.push({ type: p.action as ActionType, values: p.values })
        }
      }
      modifiedBlocks.add(match.index)
      applied++
    }
  }

  // Return the modified filter object - caller handles serialization and I/O
  return {
    filter,
    modifiedBlocks,
    conflicts,
    stats: { applied, skipped: skipped - conflicts.length, conflicts: conflicts.length },
  }
}
