import { writeFileSync } from 'node:fs'
import type { FilterFile, FilterVersion } from '@shared/types'
import { deleteVersion, saveVersion } from '../update/versions'
import { isEmptyValueListCondition } from './condition-types'
import { parseFilterFile } from './parser'
import { renderFilterSelective } from './writer'

export interface SanitizeResult {
  content: string
  changed: boolean
  emptyConditionsRemoved: number
  eolNormalized: boolean
}

/** True if `content` mixes CRLF and bare LF line endings. */
function hasMixedEol(content: string): boolean {
  return /\r\n/.test(content) && /(?<!\r)\n/.test(content)
}

/** True if any block has an empty value-list condition (dangling `BaseType ==`).
 *  Scoped to value-list conditions so a legitimate value-less line (a bare boolean
 *  like `Corrupted`, or an unknown future keyword) is not mistaken for damage. */
function hasEmptyValueListCondition(file: FilterFile): boolean {
  return file.blocks.some((b) => b.conditions.some((c) => isEmptyValueListCondition(c.type, c.values.length)))
}

/**
 * Detect old-code corruption: a dangling value-list condition (e.g. `BaseType ==`)
 * or mixed CRLF/LF endings. The fixed writers can produce neither, so either is
 * proof the file was written before the sync-safeguards fix.
 */
export function detectFilterDamage(file: FilterFile, content: string): boolean {
  return hasEmptyValueListCondition(file) || hasMixedEol(content)
}

/** Pure repair: strip dangling value-list conditions and normalize line endings.
 *  A block left with no conditions after stripping is removed entirely (a
 *  condition-less block is a catch-all that matches every item). */
export function sanitizeFilter(content: string): SanitizeResult {
  const file = parseFilterFile('sanitize', content)
  const modifiedBlocks = new Set<number>()
  const removedBlocks = new Set<number>()
  let emptyConditionsRemoved = 0

  for (let i = 0; i < file.blocks.length; i++) {
    const block = file.blocks[i]
    const before = block.conditions.length
    block.conditions = block.conditions.filter((c) => !isEmptyValueListCondition(c.type, c.values.length))
    const removed = before - block.conditions.length
    if (removed > 0) {
      emptyConditionsRemoved += removed
      if (block.conditions.length === 0) {
        removedBlocks.add(i)
      } else {
        modifiedBlocks.add(i)
      }
    }
  }

  const { content: rendered } = renderFilterSelective(file, modifiedBlocks, removedBlocks)
  return {
    content: rendered,
    changed: rendered !== content,
    emptyConditionsRemoved,
    eolNormalized: hasMixedEol(content),
  }
}

/**
 * Repair a filter on load if (and only if) it carries old-code damage. Saves a
 * reversible checkpoint of the original (damaged) file, then writes the repair.
 * If the write fails the checkpoint is rolled back so it never accumulates on a
 * read-only filter. Returns the content to parse (repaired or original). Never
 * throws out of a filter load.
 */
export function repairFilterOnLoad(path: string, content: string): string {
  if (process.env.SCALPEL_E2E === '1') return content
  let checkpoint: FilterVersion | null = null
  try {
    const file = parseFilterFile(path, content)
    if (!detectFilterDamage(file, content)) return content
    const r = sanitizeFilter(content)
    if (!r.changed) return content
    // Checkpoint the original first (so it captures the pre-repair state), then
    // write. If the write throws, the catch rolls the checkpoint back.
    checkpoint = saveVersion(path, true, 'Before auto-repair')
    writeFileSync(path, r.content, 'utf-8')
    if (process.env.SCALPEL_DEBUG_LOG) {
      console.warn(
        `[sanitize] repaired ${path}: removed ${r.emptyConditionsRemoved} empty condition(s)${
          r.eolNormalized ? ', normalized line endings' : ''
        }`,
      )
    }
    return r.content
  } catch (err) {
    if (checkpoint) {
      try {
        deleteVersion(checkpoint.filename)
      } catch {
        /* best-effort rollback */
      }
    }
    if (process.env.SCALPEL_DEBUG_LOG) console.warn('[sanitize] repair failed for', path, err)
    return content
  }
}
