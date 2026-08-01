/* Real (non-fixture) port of poe2.re's number-regex generator
 * (src/lib/GenerateNumberRegex.ts). Body kept verbatim with the fixture under
 * __fixtures__/poe2re/GenerateNumberRegex.ts; a parity test asserts they stay
 * equal. This is poe2.re-style output and is distinct from number-regex.ts
 * (poe.re / maps style) -- the two are NOT interchangeable.
 *
 *   round10  -- floor the value to the nearest 10 before building the pattern
 *               ("Round down to nearest 10", saves space).
 *   over100  -- append `|\d{3}` in the 10-99 branch so 3-digit rolls also match
 *               ("Match numbers over 100%", takes more space). */
export function generateNumberRegex(number: string, round10: boolean, over100: boolean): string {
  const over100mod = over100 ? '|\\d{3}' : ''
  const numbers = number.match(/\d/g)
  if (numbers === null) {
    return ''
  }
  const quant = round10 ? Math.floor(Number(numbers.join('')) / 10) * 10 : Number(numbers.join(''))
  if (Number.isNaN(quant) || quant === 0) {
    if (round10 && numbers.length === 1) {
      return '\\d'
    }
    return ''
  }
  if (quant >= 200) {
    return `2\\d\\d`
  }
  if (quant >= 150) {
    const str = quant.toString()
    const d0 = str[0]
    const d1 = str[1]
    const d2 = str[2]
    if (str[1] === '0' && str[2] === '0') {
      return `(2\\d\\d|${d0}\\d\\d)`
    } else if (str[2] === '0') {
      return `(2\\d\\d|1[${d1}-9]\\d)`
    } else if (str[1] === '0') {
      return `(2\\d\\d|\\d0[${d2}-9]|\\d[1-9]\\d)`
    } else if (str[1] === '9' && str[2] === '9') {
      return `(2\\d\\d|199)`
    } else {
      if (d1 === '9') {
        return `(2\\d\\d|19[${d2}-9])`
      }
      return `[12]([${d1}-9][${d2}-9]|[${Number(d1) + 1}-9]\\d)`
    }
  }
  if (quant > 100) {
    const str = quant.toString()
    const d0 = str[0]
    const d1 = str[1]
    const d2 = str[2]
    if (str[1] === '0' && str[2] === '0') {
      return `${d0}\\d\\d`
    } else if (str[2] === '0') {
      return `1[${d1}-9]\\d`
    } else if (str[1] === '0') {
      return `(\\d0[${d2}-9]|\\d[1-9]\\d)`
    } else if (str[1] === '9' && str[2] === '9') {
      return `199`
    } else {
      if (d1 === '9') {
        return `19[${d2}-9]`
      }
      return `1([${d1}-9][${d2}-9]|[${Number(d1) + 1}-9]\\d)`
    }
  }
  if (quant === 100) {
    return `\\d{3}`
  }
  if (quant > 9) {
    const str = quant.toString()
    const d0 = str[0]
    const d1 = str[1]
    if (str[1] === '0') {
      if (over100) {
        return `([${d0}-9]\\d${over100mod})`
      } else {
        return `[${d0}-9]\\d`
      }
    } else if (str[0] === '9') {
      return `(${d0}[${d1}-9]${over100mod})`
    } else {
      return `(${d0}[${d1}-9]|[${Number(d0) + 1}-9]\\d${over100mod})`
    }
  }
  if (quant <= 9) {
    return `([${quant}-9]|\\d\\d\\d?)`
  }
  return number
}

/** Port of poe2.re's generateNumberRangeRegex (current vintage, July 2026): the
 *  shortest regex matching an inclusive [min, max] integer range. `.` stands for
 *  any digit (shorter than \d; callers escape when needed). Only 1-2 digit numbers
 *  are supported; 3-digit input returns ''. */
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
  if (Number.isNaN(lo) || Number.isNaN(hi) || lo < 0 || hi > 99 || hi < lo) {
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

/** Port of poe2.re's generateBoundedValueRegex: matches a rolled value bounded to
 *  its mod's (min-max) range display, anchored on the literal "(". Falls back to
 *  our scalar >= regex when the bounds do not fit 2 digits - the fallback keeps
 *  Scalpel's over100 handling (deviation from upstream, which uses its own scalar). */
export function generateBoundedValueRegex(min: string, max: string, round10: boolean, over100: boolean): string {
  const ranged = generateNumberRangeRegex(min, max, round10)
  const number = ranged !== '' ? ranged : generateNumberRegex(min, round10, over100)
  return `${number.replace(/\./g, '\\d')}\\(`
}
