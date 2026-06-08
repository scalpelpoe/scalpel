/* Reference implementation type from poe2.re/src/components/selectList/SelectList.tsx.
 * Verbatim copy used by the parity test against poe2.re's regex engine. Do not edit. */
export interface SelectOption {
  name: string
  value: number | null
  isSelected: boolean
  ranges: number[][]
  regex: string
}
