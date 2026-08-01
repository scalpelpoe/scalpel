// Verbatim extraction from poe-vendor-string (https://github.com/veiset/poe-vendor-string),
// src/pages/beast/Beast.tsx. Used with permission. All credit to veiset and contributors.
//
// PARITY ORACLE. Do not "fix", refactor, or tidy anything in this file. Our engine is
// asserted byte-equal against it. If a test fails, change beast-engine.ts.

export interface BeastPriceRegex {
  name: string
  chaosValue: number
  recipe: string
  regex: string
  numberOfBeasts: number
  harvest: boolean
  redBeast: boolean
}

export const sortByChaosValue = (e1: BeastPriceRegex, e2: BeastPriceRegex): number => e2.chaosValue - e1.chaosValue

export const generateRegex = (
  prices: BeastPriceRegex[],
  includeHarvest: boolean,
  minValue: number | undefined,
  maxValue: number | undefined,
  menagerieLimit: boolean,
  redBeastOnly: boolean,
): string => {
  let done = false
  const regex = prices
    .filter((e) => (redBeastOnly ? e.redBeast : true))
    .filter((e) => e.chaosValue > 0)
    .reduce((acc: string, el: BeastPriceRegex) => {
      if (done) {
        return acc
      }
      if (!includeHarvest && el.harvest) {
        return acc
      }
      if (acc.length + el.regex.length + 1 > (menagerieLimit ? 100 : 250)) {
        done = true
        return acc
      }
      if (el.chaosValue > (maxValue ?? 9999999)) return acc
      if (el.chaosValue < (minValue ?? 0)) return acc
      return acc + '|' + el.regex
    }, '')
  return `${regex.substring(1)}`
}
