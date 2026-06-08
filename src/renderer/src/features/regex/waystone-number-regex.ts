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
