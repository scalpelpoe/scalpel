/* Reference implementation from poe2.re/src/lib/SelectedOptionRegex.ts. Imports
 * rewritten to use the local fixture files. Behavior unchanged. */
import type { SelectOption } from './SelectOption'
import { generateNumberRegex } from './GenerateNumberRegex'

export function selectedOptionRegex(option: SelectOption, round10: boolean, over100: boolean): string {
  if (option.value) {
    return `${generateNumberRegex(option.value.toString(), round10, over100)}.*${option.regex}`
  } else {
    return option.regex
  }
}
