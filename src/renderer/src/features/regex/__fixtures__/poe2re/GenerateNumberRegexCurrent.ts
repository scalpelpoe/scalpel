/* Reference implementation from poe2.re/src/lib/GenerateNumberRegex.ts (July 2026
 * vintage: bounded-range matching for the "value(min-max)" item text). The older
 * vintage our engines' scalar generateNumberRegex tracks lives in
 * ./GenerateNumberRegex.ts - both are kept because different engine paths track
 * different upstream vintages. Do not edit. */
export function generateNumberRegex(number: string, round10: boolean): string {
  const numbers = number.match(/\d/g)
  if (numbers === null) {
    return ''
  }
  const quant = round10 ? Math.floor(Number(numbers.join('')) / 10) * 10 : Number(numbers.join(''))
  if (isNaN(quant) || quant === 0) {
    if (round10 && numbers.length === 1) {
      return '.'
    }
    return ''
  }
  if (quant >= 100) {
    return threeDigitMin(quant)
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

// Matches an affix's actual rolled value bounded to "(min-max)", anchored on "("
// Falls back to an open-ended ">= min" match when the bounds don't fit a 2-digit range
export function generateBoundedValueRegex(min: string, max: string, round10: boolean): string {
  const ranged = generateNumberRangeRegex(min, max, round10)
  const number = ranged !== '' ? ranged : generateNumberRegex(min, round10)
  return `${number.replace(/\./g, '\\d')}\\(`
}

// Generates the shortest regex matching an inclusive [min, max] integer range.
// NOTE: only handles 1- and 2-digit numbers (0-99); 3-digit input is not supported.
export function generateNumberRangeRegex(min: string, max: string, round10: boolean): string {
  const minDigits = min.match(/\d/g)
  const maxDigits = max.match(/\d/g)
  if (minDigits === null || maxDigits === null) {
    return ''
  }
  if (minDigits.length > 2 || maxDigits.length > 2) {
    return ''
  }
  let lo = Number(minDigits.join(''))
  let hi = Number(maxDigits.join(''))
  if (round10) {
    lo = Math.floor(lo / 10) * 10
    hi = Math.floor(hi / 10) * 10
  }
  if (isNaN(lo) || isNaN(hi) || lo < 0 || hi > 99 || hi < lo) {
    return ''
  }

  const parts: string[] = []
  if (lo <= 9) {
    parts.push(singleDigitPart(lo, Math.min(hi, 9)))
  }
  if (hi >= 10) {
    parts.push(...twoDigitParts(Math.max(lo, 10), hi))
  }

  return parts.length > 1 ? `(${parts.join('|')})` : parts[0]
}

function singleDigitPart(lo: number, hi: number): string {
  if (lo === hi) return `${lo}`
  return lo === 0 && hi === 9 ? '.' : `[${lo}-${hi}]`
}

function twoDigitParts(lo: number, hi: number): string[] {
  const a = Math.floor(lo / 10)
  const b = lo % 10
  const c = Math.floor(hi / 10)
  const d = hi % 10

  if (a === c) {
    if (b === d) return [`${a}${b}`]
    return [b === 0 && d === 9 ? `${a}.` : `${a}[${b}-${d}]`]
  }

  const parts: string[] = []
  if (b !== 0) {
    parts.push(b === 9 ? `${a}9` : `${a}[${b}-9]`)
  }
  const fullLo = b === 0 ? a : a + 1
  const fullHi = d === 9 ? c : c - 1
  if (fullLo <= fullHi) {
    parts.push(fullLo === fullHi ? `${fullLo}.` : `[${fullLo}-${fullHi}].`)
  }
  if (d !== 9) {
    parts.push(d === 0 ? `${c}0` : `${c}[0-${d}]`)
  }
  return parts
}

function threeDigitMin(n: number): string {
  const str = n.toString()
  const d0 = str[0]
  const d1 = str[1]
  const d2 = str[2]
  const D0 = Number(d0)
  const D1 = Number(d1)
  if (d1 === '0' && d2 === '0') {
    return D0 === 9 ? `${d0}..` : `[${d0}-9]..`
  }
  let head: string
  if (d2 === '0') {
    head = d1 === '9' ? `${d0}9.` : `${d0}[${d1}-9].`
  } else if (d1 === '0') {
    head = `${d0}(0[${d2}-9]|[1-9].)`
  } else if (d1 === '9' && d2 === '9') {
    head = `${d0}99`
  } else if (d1 === '9') {
    head = `${d0}9[${d2}-9]`
  } else {
    head = `${d0}(${d1}[${d2}-9]|[${D1 + 1}-9].)`
  }
  return D0 === 9 ? head : `(${head}|[${D0 + 1}-9]..)`
}
