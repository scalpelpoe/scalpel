/**
 * Generate a compact regex that matches any integer >= min.
 * Matches poe.re's output style: uses `.` instead of `\d`, `..` instead of `\d{2}`,
 * `[89]` instead of `[8-9]`, and caps at 3 digits (map mods don't exceed 999).
 *
 * Examples:
 *   atLeastRegex(5)   -> "([5-9]|\\d.)"     matches 5-9 or any 2+ digit
 *   atLeastRegex(70)  -> "([7-9].|\\d..)"    matches 70-99 or any 3-digit
 *   atLeastRegex(75)  -> "(7[5-9]|[89].|\\d..)" matches 75-79, 80-99, or 100+
 *   atLeastRegex(100) -> "\\d.."              any 3-digit number
 *   atLeastRegex(150) -> "(1[5-9].|[2-9]..)" matches 150-199 or 200-999
 */
export function atLeastRegex(min: number): string {
  if (min <= 0) return '\\d+'
  if (min <= 1) return '[1-9]\\d*'

  const parts: string[] = []
  const s = String(min)

  if (s.length === 1) {
    // Single digit: [N-9] or any 2-3 digit
    parts.push(charRange(min, 9))
    parts.push(dots(2))
    parts.push(dots(3))
  } else if (s.length === 2) {
    const tens = Math.floor(min / 10)
    const ones = min % 10

    if (ones === 0) {
      // Exact tens boundary: [T-9]. or ...
      parts.push(`${charRange(tens, 9)}.`)
    } else {
      // Partial tens: T[O-9], then [T+1..9]., then ...
      parts.push(`${tens}${charRange(ones, 9)}`)
      if (tens + 1 <= 9) parts.push(`${charRange(tens + 1, 9)}.`)
    }
    parts.push(dots(3))
  } else {
    // 3 digits (100-999)
    const hundreds = Math.floor(min / 100)
    const remainder = min % 100

    if (remainder === 0) {
      // Exact hundreds boundary
      parts.push(`${charRange(hundreds, 9)}..`)
    } else {
      const tens = Math.floor(remainder / 10)
      const ones = remainder % 10

      if (ones === 0) {
        // e.g. 150: 1[5-9]. then [2-9]..
        parts.push(`${hundreds}${charRange(tens, 9)}.`)
      } else {
        // e.g. 175: 17[5-9], 1[8-9]., then [2-9]..
        parts.push(`${hundreds}${tens}${charRange(ones, 9)}`)
        if (tens + 1 <= 9) parts.push(`${hundreds}${charRange(tens + 1, 9)}.`)
      }
      if (hundreds + 1 <= 9) parts.push(`${charRange(hundreds + 1, 9)}..`)
    }
  }

  if (parts.length === 1) return parts[0]
  return `(${parts.join('|')})`
}

/** Character class or single char for a range */
function charRange(from: number, to: number): string {
  if (from === to) return String(from)
  if (to - from === 1) return `[${from}${to}]`
  return `[${from}-${to}]`
}

/** Match any N-digit number: leading `\d` anchors the alternation to actual
 *  numbers; trailing dots stay loose to keep the pattern compact. Without the
 *  digit anchor, `.*(9.|...)%` can land on non-numeric 3-char sequences in PoE's
 *  stash search and produce false positives. */
function dots(n: number): string {
  return '\\d' + '.'.repeat(n - 1)
}
