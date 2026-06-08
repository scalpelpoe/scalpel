/** Faithful port of poe2.re's relic regex builder (src/pages/relic/RelicResult.ts
 *  + src/lib/SelectedOptionRegex.ts). relic-engine.test.ts holds behavioural unit
 *  tests (not a vendored-source parity test like waystone/vendor) that lock the
 *  exact output of this logic.
 *
 *  Quirks preserved from poe2.re, bug-for-bug:
 *   - "any" joins every selected token (prefix + suffix) into one quoted alternation.
 *   - "both" emits one quoted group per non-empty affix side (semantically: at least
 *     one prefix AND at least one suffix). When only one side is selected, the empty
 *     side is filtered out and "both" degrades to a single group -- this matches
 *     poe2.re's generateRelicResult exactly and is intentional.
 *   - poe2.re hardcodes round10=false for relic; its current number-regex always includes a 3-digit branch, so there is no over-100 toggle. See relic-number-regex.ts. */

import type { RelicMod } from '../../../../shared/data/regex/relic-mods'
import { generateNumberRegex } from './relic-number-regex'

export type RelicMatchType = 'any' | 'both'

export interface RelicSelections {
  /** Mod ids the user wants to match (prefix or suffix). */
  want: Set<number>
  /** Per-mod magnitude threshold keyed by mod id. Falsy (0/undefined) = bare token. */
  wantValues: Record<number, number>
  matchType: RelicMatchType
}

/** poe2.re's selectedOptionRegex(option, false): a chosen magnitude prefixes the
 *  token; a falsy value yields the bare token. */
function modToken(mod: RelicMod, value: number | undefined): string {
  if (!value) return mod.regex
  return `${generateNumberRegex(String(value), false)}.*${mod.regex}`
}

export function buildRelicRegex(args: { mods: RelicMod[]; selections: RelicSelections }): string {
  const { mods, selections } = args
  const { want, wantValues, matchType } = selections

  const sideFor = (affix: RelicMod['affix']): string =>
    mods
      .filter((m) => m.affix === affix && want.has(m.id))
      .map((m) => modToken(m, wantValues[m.id]))
      .join('|')

  const modifiers = [sideFor('PREFIX'), sideFor('SUFFIX')].filter((e) => e !== '')
  if (modifiers.length === 0) return ''
  if (matchType === 'any') return `"${modifiers.join('|')}"`
  return modifiers.map((e) => `"${e}"`).join(' ')
}
