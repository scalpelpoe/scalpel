/* Reference implementation from poe2.re/src/lib/SelectedOptionRegex.ts (July 2026
 * vintage: bounded value(min-max) matching). Imports rewritten to the local fixture
 * files. Behavior unchanged. */
import type { SelectOption } from './SelectOption'
import { generateBoundedValueRegex } from './GenerateNumberRegexCurrent'

export function selectedOptionRegex(option: SelectOption, round10: boolean): string {
  if (option.value) {
    return `${generateBoundedValueRegex(option.value.toString(), option.ranges[0][1].toString(), round10)}.*${option.regex}`
  }
  return option.regex
}
