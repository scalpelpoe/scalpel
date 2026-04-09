import { randomUUID } from 'crypto'
import type {
  FilterBlock,
  FilterCondition,
  FilterFile,
  FilterAction,
  ConditionType,
  ActionType,
  ComparisonOperator,
  TierTag,
  Visibility,
} from '../../shared/types'

function parseTierTag(comment: string): TierTag | undefined {
  const typeMatch = comment.match(/\$type->(\S+)/)
  const tierMatch = comment.match(/\$tier->(\S+)/)
  if (!typeMatch || !tierMatch) return undefined
  return { typePath: typeMatch[1], tier: tierMatch[1] }
}

const ACTION_TYPES = new Set<ActionType>([
  'SetTextColor',
  'SetBorderColor',
  'SetBackgroundColor',
  'SetFontSize',
  'PlaySound',
  'PlayAlertSound',
  'PlayAlertSoundPositional',
  'CustomAlertSound',
  'CustomAlertSoundOptional',
  'PlayEffect',
  'MinimapIcon',
  'DisableDropSound',
  'EnableDropSound',
  'DisableDropSoundIfAlertSound',
  'EnableDropSoundIfAlertSound',
])

const _COMPARISON_OPS = new Set(['>=', '<=', '==', '>', '<', '='])

/** Parse a line of values respecting quoted strings */
function parseValues(raw: string): string[] {
  const values: string[] = []
  let i = 0
  raw = raw.trim()

  while (i < raw.length) {
    if (raw[i] === '"') {
      const end = raw.indexOf('"', i + 1)
      if (end === -1) {
        values.push(raw.slice(i + 1))
        break
      }
      values.push(raw.slice(i + 1, end))
      i = end + 1
    } else if (raw[i] === ' ' || raw[i] === '\t') {
      i++
    } else {
      const end = raw.slice(i).search(/[\s]/)
      if (end === -1) {
        values.push(raw.slice(i))
        break
      }
      values.push(raw.slice(i, i + end))
      i = i + end
    }
  }

  return values.filter(Boolean)
}

function stripComment(line: string): string {
  const hashIdx = line.indexOf('#')
  if (hashIdx === -1) return line
  // Check if # is inside a quoted string
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuote = !inQuote
    if (line[i] === '#' && !inQuote) return line.slice(0, i)
  }
  return line
}

function parseCondition(keyword: string, rest: string): FilterCondition {
  const type = keyword as ConditionType

  // Check for comparison operator at the start of rest
  let operator: ComparisonOperator = '='
  let explicitOperator = false
  let valueStr = rest.trim()

  // Check longest operators first to avoid '=' matching before '=='
  for (const op of ['>=', '<=', '==', '>', '<', '=']) {
    if (valueStr.startsWith(op)) {
      operator = op as ComparisonOperator
      explicitOperator = true
      valueStr = valueStr.slice(op.length).trim()
      break
    }
  }

  const values = parseValues(valueStr)
  return { type, operator, values, explicitOperator }
}

function parseAction(keyword: string, rest: string): FilterAction {
  const type = keyword as ActionType
  const values = parseValues(rest.trim())
  return { type, values }
}

export function parseFilterFile(path: string, content: string): FilterFile {
  const rawLines = content.split('\n')
  const blocks: FilterBlock[] = []

  let currentBlock: Omit<FilterBlock, 'id'> | null = null
  let pendingComment: string | undefined = undefined

  const finalizeBlock = (lineEnd: number) => {
    if (currentBlock) {
      currentBlock.lineEnd = lineEnd
      blocks.push({ ...currentBlock, id: randomUUID() } as FilterBlock)
      currentBlock = null
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const lineNum = i + 1 // 1-based
    const raw = rawLines[i]
    const stripped = stripComment(raw).trim()

    if (stripped === '') {
      // Blank line — collect comment if it's a comment-only line
      const trimmed = raw.trim()
      if (trimmed.startsWith('#')) {
        pendingComment = (pendingComment ? pendingComment + '\n' : '') + trimmed
      } else {
        pendingComment = undefined
      }
      continue
    }

    const words = stripped.split(/\s+/)
    const keyword = words[0]

    if (keyword === 'Show' || keyword === 'Hide' || keyword === 'Minimal') {
      finalizeBlock(i) // end previous block at line before this
      // Capture inline comment from the Show/Hide line (e.g. "# %D9 $type->currency $tier->t1")
      const hashIdx = raw.indexOf('#')
      const inlineComment = hashIdx !== -1 ? raw.slice(hashIdx + 1).trim() : undefined
      const tierTag = inlineComment ? parseTierTag(inlineComment) : undefined
      currentBlock = {
        visibility: keyword as Visibility,
        conditions: [],
        actions: [],
        continue: false,
        lineStart: lineNum,
        lineEnd: lineNum,
        leadingComment: pendingComment,
        inlineComment,
        tierTag,
      }
      pendingComment = undefined
      continue
    }

    if (!currentBlock) {
      // Line outside a block — check for standalone comment
      const trimmed = raw.trim()
      if (trimmed.startsWith('#')) {
        pendingComment = (pendingComment ? pendingComment + '\n' : '') + trimmed
      }
      continue
    }

    if (keyword === 'Continue') {
      currentBlock.continue = true
      continue
    }

    const rest = words.slice(1).join(' ')

    if (ACTION_TYPES.has(keyword as ActionType)) {
      currentBlock.actions.push(parseAction(keyword, rest))
    } else {
      // Any non-action keyword inside a block is treated as a condition.
      // Unknown condition types are evaluated as 'unknown' by the matcher.
      currentBlock.conditions.push(parseCondition(keyword, rest))
    }
  }

  finalizeBlock(rawLines.length)

  return { path, blocks, rawLines }
}
