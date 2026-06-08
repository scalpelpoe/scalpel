/* Real (non-fixture) port of poe2.re's CURRENT number-regex generator
 * (src/lib/GenerateNumberRegex.ts). poe2.re rewrote this generator after
 * waystone-number-regex.ts was ported, so the two INTENTIONALLY differ:
 * waystone-number-regex.ts is the older vintage (still matches the waystone/tablet
 * vendored fixtures and trade output); this is the current relic-page algorithm,
 * verified live against poe2.re/relic. Body kept verbatim with the fixture under
 * __fixtures__/poe2re/GenerateRelicNumberRegex.ts; relic-number-regex.test.ts asserts
 * they stay equal.
 *
 *   round10 -- floor the value to the nearest 10 before building the pattern
 *              (relic always passes false). Unlike the older generator there is no
 *              over100 flag: a 3-digit (100+) branch is always included. */
export function generateNumberRegex(number: string, round10: boolean): string {
  const numbers = number.match(/\d/g)
  if (numbers === null) {
    return ''
  }
  const quant = round10 ? Math.floor(Number(numbers.join('')) / 10) * 10 : Number(numbers.join(''))
  if (Number.isNaN(quant) || quant === 0) {
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
