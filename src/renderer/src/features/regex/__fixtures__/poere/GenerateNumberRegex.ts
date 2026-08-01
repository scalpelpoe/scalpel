// Verbatim from poe.re (veiset/poe-vendor-string) src/utils/regex/GenerateNumberRegex.ts
// (modulo Biome formatting applied by the pre-commit hook; semantics unchanged).
// Parity fixture - do not edit. When parity fails, fix the port, never this file.
export function generateNumberRegex(number: string, optimize: boolean): string {
  const numbers = number.match(/\d/g)
  if (numbers === null) {
    return ''
  }
  const quant = optimize ? Math.floor(Number(numbers.join('')) / 10) * 10 : Number(numbers.join(''))
  if (isNaN(quant) || quant === 0) {
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

/**
 * Takes a number as an input and generates a regex that matches
 * that number or a higher number (and that's less than 1000, cause size limitations)
 */
export function minNumberRegex(number: string, optimize: boolean): string {
  const numbers = number.match(/\d/g)
  if (numbers === null) {
    return ''
  }

  const n = optimize ? Math.floor(Number(numbers.join('')) / 10) * 10 : Number(numbers.join(''))

  return match2(n)
}

/**
 * Regex for a 1-digit number
 */
function match1(n: number): string {
  const n1 = n % 10
  if (n >= 9) return ''
  if (n1 === 0) return '\\d'
  return `[${n1}-9]`
}

/**
 * Regex for a 2-digit number
 */
function match2(n: number) {
  const n2 = n % 100
  const n1 = n % 10
  if (n >= 99) return '\\d\\d'
  if (n2 === 0) return '\\d\\d'
  const trunc = truncateLastDigit(n2)
  const truncP1 = trunc + 1
  const oneNumberRegex = match1(n) ? `${match1(n)}|` : ''
  if (trunc >= 2) {
    return `${oneNumberRegex}[1-${trunc}]${match1(n1)}|${truncP1}\\d`
  } else {
    return `${oneNumberRegex}${match1(n)}|1${match1(n1)}|${truncP1}\\d`
  }
}

/**
 * Regex for a 3-digit number
 */
function match3(n: number) {
  const n3 = n % 1000
  const n2 = n % 100
  const n1 = n % 10
  if (n >= 999) return '...'
  if (n2 === 0) return '...'

  return `${match1(n)}`
}

function truncateLastDigit(n: number): number {
  return Math.floor(n / 10)
}
