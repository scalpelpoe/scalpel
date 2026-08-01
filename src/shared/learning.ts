// src/shared/learning.ts

/** Chip types the adaptive-defaults engine can learn and the context menu can
 *  pin: affix-family mods plus granted skills (issue #478) - every one a plain
 *  enable/disable toggle. Property/ternary/min-max chips (chipState-driven, not
 *  a boolean) remain phase 2. */
export const LEARNABLE_TYPES = new Set([
  'explicit',
  'implicit',
  'pseudo',
  'crafted',
  'fractured',
  'enchant',
  'imbued',
  'skill',
])

export function isLearnable(f: { type: string }): boolean {
  return LEARNABLE_TYPES.has(f.type)
}
