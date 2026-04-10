import { writeFileSync } from 'fs'
import type { FilterBlock, FilterFile } from '../../shared/types'

/** Serialize a single FilterBlock back to .filter text */
function serializeBlock(block: FilterBlock): string {
  const lines: string[] = []

  if (block.leadingComment) {
    lines.push(block.leadingComment)
  }

  const commentSuffix = block.inlineComment ? ' # ' + block.inlineComment : ''
  lines.push(block.visibility + commentSuffix)

  for (const cond of block.conditions) {
    const { type, operator, values } = cond

    // Only emit operator for numeric conditions
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

    const emitOperator = numericConditions.has(type) || cond.explicitOperator
    const valStr = values.map((v) => quoteIfNeeded(v)).join(' ')

    if (emitOperator) {
      lines.push(`    ${type} ${operator} ${valStr}`)
    } else {
      lines.push(`    ${type} ${valStr}`)
    }
  }

  for (const action of block.actions) {
    // Skip actions with empty values (e.g. PlayEffect set to "None")
    if (action.values.length === 0) continue
    const isCustomSound = action.type === 'CustomAlertSound' || action.type === 'CustomAlertSoundOptional'
    const valStr = action.values
      .map((v, i) => {
        // CustomAlertSound filepath (first value) must always be quoted
        if (isCustomSound && i === 0) return `"${v}"`
        return quoteIfNeeded(v)
      })
      .join(' ')
    lines.push(`    ${action.type}${valStr ? ' ' + valStr : ''}`)
  }

  if (block.continue) {
    lines.push('    Continue')
  }

  return lines.join('\n')
}

function quoteIfNeeded(value: string): string {
  // Quote if contains spaces or is empty
  if (value.includes(' ') || value === '') {
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
  const serialized = serializeBlock(updatedBlock)
  const newBlockLines = serialized.split('\n')

  // Replace lines in rawLines
  const newLines = [...filterFile.rawLines]

  // Account for leading comment if it changed
  const startLine = block.leadingComment
    ? block.lineStart - block.leadingComment.split('\n').length - 1
    : block.lineStart - 1

  newLines.splice(startLine, block.lineEnd - startLine, ...newBlockLines)

  writeFileSync(filterFile.path, newLines.join('\n'), 'utf-8')

  // Update in-memory state
  filterFile.rawLines = newLines
  filterFile.blocks[blockIndex] = {
    ...updatedBlock,
    lineStart: startLine + 1,
    lineEnd: startLine + newBlockLines.length,
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

  writeFileSync(filterFile.path, lines.join('\n'), 'utf-8')
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
      lines[i] = line.replace(/  +/g, ' ')
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
      lines[i] = lines[i].slice(0, commentIdx).trimEnd() + ' ' + quoted + ' ' + lines[i].slice(commentIdx)
    } else {
      lines[i] = lines[i].trimEnd() + ' ' + quoted
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
  condType: 'StackSize' | 'Quality',
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
      if (match) allValues.add(parseInt(match[2]))
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

      const val = parseInt(match[2])
      const newVal = replacements.get(val)
      if (newVal !== undefined && newVal !== val) {
        lines[lineIdx] = line.replace(new RegExp(`(${condType}\\s*(?:>=|>|<=|<|==|=)?\\s*)${val}\\b`), `$1${newVal}`)
      }
    }
  }

  writeFileSync(filterFile.path, lines.join('\n'), 'utf-8')
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

/** Write the entire filter file (used after multiple edits). */
export function writeFullFilter(filterFile: FilterFile): void {
  const sections: string[] = []
  let lastEnd = 0

  for (const block of filterFile.blocks) {
    // Preserve any raw content between blocks
    const gapStart = lastEnd
    const blockStart = block.lineStart - 1

    if (blockStart > gapStart) {
      sections.push(filterFile.rawLines.slice(gapStart, blockStart).join('\n'))
    }

    sections.push(serializeBlock(block))
    lastEnd = block.lineEnd
  }

  // Trailing content after last block
  if (lastEnd < filterFile.rawLines.length) {
    sections.push(filterFile.rawLines.slice(lastEnd).join('\n'))
  }

  writeFileSync(filterFile.path, sections.join('\n'), 'utf-8')
}

/**
 * Write a filter file, only re-serializing blocks in modifiedBlocks.
 * Unmodified blocks keep their original raw lines, avoiding serializer round-trip bugs.
 */
export function writeFilterSelective(filterFile: FilterFile, modifiedBlocks: Set<number>): void {
  const sections: string[] = []
  let lastEnd = 0

  for (let i = 0; i < filterFile.blocks.length; i++) {
    const block = filterFile.blocks[i]
    const gapStart = lastEnd
    const blockStart = block.lineStart - 1

    if (blockStart > gapStart) {
      sections.push(filterFile.rawLines.slice(gapStart, blockStart).join('\n'))
    }

    if (modifiedBlocks.has(i)) {
      sections.push(serializeBlock(block))
    } else {
      // Use original raw lines - preserves exact formatting
      sections.push(filterFile.rawLines.slice(blockStart, block.lineEnd).join('\n'))
    }
    lastEnd = block.lineEnd
  }

  if (lastEnd < filterFile.rawLines.length) {
    sections.push(filterFile.rawLines.slice(lastEnd).join('\n'))
  }

  writeFileSync(filterFile.path, sections.join('\n'), 'utf-8')
}
