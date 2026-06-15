import type { FilterBlock } from '@shared/types'
import { isEmptyValueListCondition } from './condition-types'
import { parseFilterFile } from './parser'
import { serializeBlock } from './writer'

/** Unit separator - never appears in filter text, so joining values with it
 *  guarantees two different value lists can't collide into the same fingerprint. */
const SEP = '\x1f'

/** Structural fingerprint of a block for round-trip comparison. Ignores
 *  explicitOperator and leading-comment whitespace. Empty-value actions are
 *  excluded because serializeBlock omits them (so the reparse won't have them). */
function blockShape(b: FilterBlock): string {
  const conds = b.conditions.map((c) => `${c.type}~${c.operator}~${c.values.join(SEP)}`)
  const acts = b.actions.filter((a) => a.values.length > 0).map((a) => `${a.type}~${a.values.join(SEP)}`)
  return JSON.stringify({
    v: b.visibility,
    cont: b.continue,
    inline: b.inlineComment ?? '',
    conds,
    acts,
  })
}

/**
 * Validate a re-serialized block. Returns a list of error strings ([] = valid).
 *
 * A block is valid iff:
 *  1. No condition has an empty value list (catches dangling `BaseType ==`).
 *  2. It round-trips: serializing then re-parsing yields exactly one block with
 *     the same structural shape.
 *
 * IMPORTANT: condition values are treated as opaque strings. Do NOT add numeric
 * checks - socket conditions legitimately carry color-letter values like
 * `6WWWWWW` / `AAAA`.
 */
export function validateBlock(block: FilterBlock): string[] {
  const errors: string[] = []

  for (const c of block.conditions) {
    // Only a value-list condition (BaseType, Class, ...) is invalid when empty.
    // A value-less boolean line (e.g. a bare `Corrupted`) is left alone.
    if (isEmptyValueListCondition(c.type, c.values.length)) {
      errors.push(`condition ${c.type} has no values`)
    }
  }

  const text = serializeBlock(block, '\t').join('\n')
  const reparsed = parseFilterFile('validate', text)
  if (reparsed.blocks.length !== 1) {
    errors.push(`serialized block parsed into ${reparsed.blocks.length} blocks`)
  } else if (blockShape(reparsed.blocks[0]) !== blockShape(block)) {
    errors.push('serialized block did not round-trip structurally')
  }

  return errors
}
