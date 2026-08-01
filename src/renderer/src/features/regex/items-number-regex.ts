/** Faithful port of poe.re's GenerateNumberRegex.generateNumberRegex - the Item
 *  page vintage (dot-style placeholders; ItemOuput rewrites '.' to '\d' at the
 *  call site). Distinct from atLeastRegex (maps) and the poe2.re vintages.
 *  Upstream's unused minNumberRegex/match1/match2/match3 helpers are dropped.
 *  Quirks preserved:
 *  - digits are extracted with match(/\d/g) and re-joined, so '12.5' reads as
 *    125 and '1a2' as 12
 *  - >=200 truncates twice and emits `[H-9]..` (matches 200-999 by hundreds)
 *  - the 150-199 no-trailing-zero branch emits `[12](...)` which also matches
 *    some 12x values (upstream bug, kept)
 *  - <=9 emits `([n-9]|\d..?)` (any 2-3 digit number passes) */
export function itemsNumberRegex(number: string, optimize: boolean): string {
  const numbers = number.match(/\d/g)
  if (numbers === null) {
    return ''
  }
  const quant = optimize ? Math.floor(Number(numbers.join('')) / 10) * 10 : Number(numbers.join(''))
  if (Number.isNaN(quant) || quant === 0) {
    if (optimize && numbers.length === 1) {
      return '.'
    }
    return ''
  }
  if (quant >= 200) {
    const v = truncateLastDigit(truncateLastDigit(quant))
    return `[${v}-9]..`
  }
  if (quant >= 150) {
    const str = quant.toString()
    const d0 = str[0]
    const d1 = str[1]
    const d2 = str[2]
    if (str[1] === '0' && str[2] === '0') {
      return `([2-9]..|${d0}..)`
    } else if (str[2] === '0') {
      return `([2-9]..|1[${d1}-9].)`
    } else if (str[1] === '0') {
      return `([2-9]..|\\d0[${d2}-9]|\\d[1-9].)`
    } else if (str[1] === '9' && str[2] === '9') {
      return `([2-9]..|199)`
    } else {
      if (d1 === '9') {
        return `([2-9]..|19[${d2}-9])`
      }
      return `[12]([${d1}-9][${d2}-9]|[${Number(d1) + 1}-9].)`
    }
  }
  if (quant > 100) {
    const str = quant.toString()
    const d0 = str[0]
    const d1 = str[1]
    const d2 = str[2]
    if (str[1] === '0' && str[2] === '0') {
      return `${d0}..`
    } else if (str[2] === '0') {
      return `(1[${d1}-9].|[2-9]..)`
    } else if (str[1] === '0') {
      return `(\\d0[${d2}-9]|\\d[1-9].)`
    } else if (str[1] === '9' && str[2] === '9') {
      return `(199|[2-9]..)`
    } else {
      if (d1 === '9') {
        return `19[${d2}-9]`
      }
      return `(1([${d1}-9][${d2}-9]|[${Number(d1) + 1}-9].)|[2-9]..)`
    }
  }
  if (quant === 100) {
    return `\\d..`
  }
  if (quant > 9) {
    const str = quant.toString()
    const d0 = str[0]
    const d1 = str[1]
    if (str[1] === '0') {
      return `([${d0}-9].|\\d..)`
    } else if (str[0] === '9') {
      return `(${d0}[${d1}-9]|\\d..)`
    } else {
      return `(${d0}[${d1}-9]|[${Number(d0) + 1}-9].|\\d..)`
    }
  }
  if (quant <= 9) {
    return `([${quant}-9]|\\d..?)`
  }
  return number
}

function truncateLastDigit(n: number): number {
  return Math.floor(n / 10)
}
