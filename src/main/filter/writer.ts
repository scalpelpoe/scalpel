import { writeFileSync } from 'node:fs'
import type { FilterBlock, FilterFile } from '@shared/types'
import { NUMERIC_CONDITION_TYPES } from './condition-types'
import { validateBlock } from './validate'

/** Detect the indentation style used in a file (tab or spaces). */
export function detectIndent(rawLines: string[]): string {
  for (const line of rawLines) {
    if (line.startsWith('\t')) return '\t'
    const match = line.match(/^( {2,})/)
    if (match) return match[1]
  }
  return '\t'
}

/** Serialize a single FilterBlock back to .filter text lines. */
export function serializeBlock(block: FilterBlock, indent = '\t'): string[] {
  const lines: string[] = []

  if (block.leadingComment) {
    lines.push(...block.leadingComment.split('\n'))
  }

  const commentSuffix = block.inlineComment ? ` # ${block.inlineComment}` : ''
  lines.push(block.visibility + commentSuffix)

  for (const cond of block.conditions) {
    const emitOperator =
      cond.explicitOperator === true || (cond.explicitOperator === undefined && NUMERIC_CONDITION_TYPES.has(cond.type))
    const valStr = cond.values.map((v) => quoteIfNeeded(v)).join(' ')
    if (emitOperator) {
      lines.push(`${indent}${cond.type} ${cond.operator} ${valStr}`)
    } else {
      lines.push(`${indent}${cond.type} ${valStr}`)
    }
  }

  for (const action of block.actions) {
    if (action.values.length === 0) continue
    const isCustomSound = action.type === 'CustomAlertSound' || action.type === 'CustomAlertSoundOptional'
    const valStr = action.values.map((v, i) => (isCustomSound && i === 0 ? `"${v}"` : quoteIfNeeded(v))).join(' ')
    lines.push(`${indent}${action.type}${valStr ? ` ${valStr}` : ''}`)
  }

  if (block.continue) {
    lines.push(`${indent}Continue`)
  }

  return lines
}

function quoteIfNeeded(value: string): string {
  // Quote if it contains a space, is empty, or contains '#' (an unquoted '#' would
  // be parsed as the start of a comment on re-read, truncating the value and
  // breaking the round-trip; the parser respects quotes).
  if (value.includes(' ') || value === '' || value.includes('#')) {
    return `"${value}"`
  }
  return value
}

/**
 * Apply edits to a specific block in the filter file and write to disk.
 * Replaces only the lines belonging to that block, preserving everything else.
 */
export function writeBlockEdit(filterFile: FilterFile, blockIndex: number, updatedBlock: FilterBlock): void {
  const block = filterFile.blocks[blockIndex]
  const eol = filterFile.eol ?? '\n'
  const indent = detectIndent(filterFile.rawLines)
  const newBlockLines = serializeBlock(updatedBlock, indent)

  const newLines = [...filterFile.rawLines]
  const leadingLines = block.leadingComment ? block.leadingComment.split('\n').length : 0
  const headerStart = block.lineStart - 1 - leadingLines
  const bodyEnd = block.bodyEndLine ?? block.lineEnd

  newLines.splice(headerStart, bodyEnd - headerStart, ...newBlockLines)

  writeFileSync(filterFile.path, newLines.join(eol), 'utf-8')

  // Update in-memory state.
  filterFile.rawLines = newLines
  const newLeading = updatedBlock.leadingComment ? updatedBlock.leadingComment.split('\n').length : 0
  filterFile.blocks[blockIndex] = {
    ...updatedBlock,
    lineStart: headerStart + newLeading + 1,
    lineEnd: headerStart + newBlockLines.length,
    bodyEndLine: headerStart + newBlockLines.length,
  }
}

/**
 * Move an item's BaseType from one tier block to another.
 * Edits the raw lines directly so formatting and comments are preserved.
 */
export function moveBaseTypeBetweenTiers(
  filterFile: FilterFile,
  baseType: string,
  fromBlockIndex: number,
  toBlockIndex: number,
): void {
  if (fromBlockIndex === toBlockIndex) return

  const fromBlock = filterFile.blocks[fromBlockIndex]
  const toBlock = filterFile.blocks[toBlockIndex]

  // Work on raw lines — process the later block first so line numbers stay valid
  const lines = [...filterFile.rawLines]

  if (fromBlock.lineStart < toBlock.lineStart) {
    // Source is before target: add first (to target), then remove (from source)
    addBaseTypeToRawLines(lines, toBlock, baseType)
    removeBaseTypeFromRawLines(lines, fromBlock, baseType)
  } else {
    // Target is before source: remove first, then add
    removeBaseTypeFromRawLines(lines, fromBlock, baseType)
    addBaseTypeToRawLines(lines, toBlock, baseType)
  }

  writeFileSync(filterFile.path, lines.join(filterFile.eol ?? '\n'), 'utf-8')
  filterFile.rawLines = lines
}

function removeBaseTypeFromRawLines(lines: string[], block: FilterBlock, baseType: string): void {
  const escaped = escapeRegex(baseType)
  for (let i = block.lineStart - 1; i < block.lineEnd; i++) {
    const stripped = lines[i].replace(/#.*/, '').trim()
    if (!stripped.startsWith('BaseType')) continue

    // Remove all occurrences of the quoted value (with surrounding whitespace cleanup)
    let line = lines[i]
    // Remove the quoted value wherever it appears — all instances
    line = line.replace(new RegExp(`\\s*"${escaped}"`, 'g'), '')

    // Check if the BaseType line has no values left
    const afterKeyword = line
      .replace(/#.*/, '')
      .trim()
      .replace(/^BaseType\s*(==\s*)?/, '')
      .trim()
    if (afterKeyword === '') {
      lines.splice(i, 1)
      block.lineEnd--
      i--
    } else {
      // Clean up any double spaces left behind
      lines[i] = line.replace(/ {2,}/g, ' ')
    }
  }
}

function addBaseTypeToRawLines(lines: string[], block: FilterBlock, baseType: string): void {
  const quoted = `"${baseType}"`
  for (let i = block.lineStart - 1; i < block.lineEnd; i++) {
    const stripped = lines[i].replace(/#.*/, '').trim()
    if (!stripped.startsWith('BaseType')) continue

    // Check if already present — don't duplicate
    if (stripped.includes(`"${baseType}"`)) return

    // Append the new value
    const commentIdx = lines[i].indexOf('#')
    if (commentIdx !== -1) {
      lines[i] = `${lines[i].slice(0, commentIdx).trimEnd()} ${quoted} ${lines[i].slice(commentIdx)}`
    } else {
      lines[i] = `${lines[i].trimEnd()} ${quoted}`
    }
    return
  }

  // No BaseType line found — add one after the Show/Hide line
  lines.splice(block.lineStart, 0, `\tBaseType == ${quoted}`)
  block.lineEnd++
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replace a boundary value in the filter for a given condition type.
 * If the new value collides with the next boundary, push that boundary by 1 too.
 */
function updateThresholds(
  filterFile: FilterFile,
  condType: 'StackSize' | 'Quality' | 'MemoryStrands',
  oldBoundary: number,
  newBoundary: number,
  minValue: number,
): void {
  if (oldBoundary === newBoundary || newBoundary < minValue) return

  // Collect all distinct threshold values for this condition type
  const allValues = new Set<number>()
  const lines = filterFile.rawLines
  const re = new RegExp(`^${condType}\\s*(>=|>|<=|<|==|=)?\\s*(\\d+)`)

  for (const block of filterFile.blocks) {
    for (let lineIdx = block.lineStart - 1; lineIdx < block.lineEnd && lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]
      if (!line) continue
      const stripped = line.replace(/#.*/, '').trim()
      if (!stripped.startsWith(condType)) continue
      const match = stripped.match(re)
      if (match) allValues.add(parseInt(match[2], 10))
    }
  }

  // Build replacement map: old → new, pushing adjacent if collision
  const replacements = new Map<number, number>()
  replacements.set(oldBoundary, newBoundary)

  // Sort thresholds in the direction we're moving to detect collisions
  const sorted = Array.from(allValues).sort((a, b) => a - b)
  const movingUp = newBoundary > oldBoundary

  if (movingUp) {
    // Check thresholds above oldBoundary in ascending order
    for (const val of sorted) {
      if (val <= oldBoundary) continue
      const prevNewVal = replacements.get(val - 1) ?? val - 1
      // If the previous value was pushed to meet or exceed this one, push this one too
      if (prevNewVal >= val) {
        replacements.set(val, prevNewVal + 1)
      } else {
        // Check if newBoundary itself collides
        const replacedOld = replacements.get(oldBoundary)!
        if (replacedOld >= val && !replacements.has(val)) {
          replacements.set(val, replacedOld + 1)
        }
        break
      }
    }
  } else {
    // Check thresholds below oldBoundary in descending order
    for (let i = sorted.length - 1; i >= 0; i--) {
      const val = sorted[i]
      if (val >= oldBoundary) continue
      const nextNewVal = replacements.get(val + 1) ?? val + 1
      if (nextNewVal <= val) {
        replacements.set(val, Math.max(minValue, nextNewVal - 1))
      } else {
        const replacedOld = replacements.get(oldBoundary)!
        if (replacedOld <= val && !replacements.has(val)) {
          replacements.set(val, Math.max(minValue, replacedOld - 1))
        }
        break
      }
    }
  }

  // Apply replacements
  for (const block of filterFile.blocks) {
    for (let lineIdx = block.lineStart - 1; lineIdx < block.lineEnd && lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx]
      if (!line) continue
      const stripped = line.replace(/#.*/, '').trim()
      if (!stripped.startsWith(condType)) continue
      const match = stripped.match(re)
      if (!match) continue

      const val = parseInt(match[2], 10)
      const newVal = replacements.get(val)
      if (newVal !== undefined && newVal !== val) {
        lines[lineIdx] = line.replace(new RegExp(`(${condType}\\s*(?:>=|>|<=|<|==|=)?\\s*)${val}\\b`), `$1${newVal}`)
      }
    }
  }

  writeFileSync(filterFile.path, lines.join(filterFile.eol ?? '\n'), 'utf-8')
}

export function updateStackThresholds(filterFile: FilterFile, oldBoundary: number, newBoundary: number): void {
  updateThresholds(filterFile, 'StackSize', oldBoundary, newBoundary, 1)
}

export function updateQualityThresholds(filterFile: FilterFile, oldBoundary: number, newBoundary: number): void {
  updateThresholds(filterFile, 'Quality', oldBoundary, newBoundary, 0)
}

export function updateStrandThresholds(filterFile: FilterFile, oldBoundary: number, newBoundary: number): void {
  updateThresholds(filterFile, 'MemoryStrands', oldBoundary, newBoundary, 0)
}

/**
 * Render a filter, re-serializing only the blocks in `modifiedBlocks` and passing
 * everything else through as raw lines. Pure (no I/O).
 *
 * Ownership model: each block owns its header + body only
 * (`rawLines[headerStart .. bodyEnd)`). Content between one block's body and the
 * next block's header is a gap, always emitted raw - this preserves blank lines
 * and section comments. Line endings and indent follow the source file.
 *
 * Each modified block is validated after serialization; if it would be invalid,
 * its raw upstream lines are used instead (dropping that one edit) and its index
 * is reported in `fallbackBlocks`.
 */
export function renderFilterSelective(
  filterFile: FilterFile,
  modifiedBlocks: Set<number>,
  removedBlocks: Set<number> = new Set(),
): { content: string; fallbackBlocks: number[] } {
  const eol = filterFile.eol ?? '\n'
  const indent = detectIndent(filterFile.rawLines)
  const out: string[] = []
  const fallbackBlocks: number[] = []
  let prevBodyEnd = 0

  for (let i = 0; i < filterFile.blocks.length; i++) {
    const block = filterFile.blocks[i]
    const blockStart = block.lineStart - 1
    const leadingLines = block.leadingComment ? block.leadingComment.split('\n').length : 0
    const headerStart = blockStart - leadingLines
    // bodyEndLine is 1-based and inclusive, which equals the 0-based exclusive
    // slice end of the body. The lineEnd fallback is only hit for hand-built
    // blocks (parseFilterFile always sets bodyEndLine); it over-extends into the
    // gap, so it is a degraded path, not the intended one.
    const bodyEnd = block.bodyEndLine ?? block.lineEnd

    // Gap before the block (blank lines, standalone comments, section headers).
    // Emitted even for a removed block so file-level preamble / separators are
    // preserved; only the block's own header + body is dropped on removal.
    if (headerStart > prevBodyEnd) {
      out.push(...filterFile.rawLines.slice(prevBodyEnd, headerStart))
    }

    if (removedBlocks.has(i)) {
      // Drop the block entirely (its header + body). Used when an edit/repair
      // leaves a block with no conditions, which would otherwise serialize to a
      // condition-less catch-all that matches every item.
      prevBodyEnd = bodyEnd
      continue
    }

    if (modifiedBlocks.has(i) && validateBlock(block).length === 0) {
      out.push(...serializeBlock(block, indent))
    } else {
      if (modifiedBlocks.has(i)) fallbackBlocks.push(i)
      out.push(...filterFile.rawLines.slice(headerStart, bodyEnd))
    }

    prevBodyEnd = bodyEnd
  }

  // Trailing content after the last block.
  if (prevBodyEnd < filterFile.rawLines.length) {
    out.push(...filterFile.rawLines.slice(prevBodyEnd))
  }

  return { content: out.join(eol), fallbackBlocks }
}

/** Write the entire filter file (re-serializing every block). */
export function writeFullFilter(filterFile: FilterFile): void {
  const all = new Set(filterFile.blocks.map((_, i) => i))
  const { content, fallbackBlocks } = renderFilterSelective(filterFile, all)
  if (fallbackBlocks.length > 0 && process.env.SCALPEL_DEBUG_LOG) {
    console.warn('[writer] writeFullFilter kept raw lines for invalid blocks:', fallbackBlocks)
  }
  writeFileSync(filterFile.path, content, 'utf-8')
}

/**
 * Write a filter file, re-serializing only `modifiedBlocks` (validated, with
 * per-block raw fallback). Returns the indices that fell back to raw.
 */
export function writeFilterSelective(
  filterFile: FilterFile,
  modifiedBlocks: Set<number>,
  removedBlocks: Set<number> = new Set(),
): { fallbackBlocks: number[] } {
  const { content, fallbackBlocks } = renderFilterSelective(filterFile, modifiedBlocks, removedBlocks)
  writeFileSync(filterFile.path, content, 'utf-8')
  return { fallbackBlocks }
}
