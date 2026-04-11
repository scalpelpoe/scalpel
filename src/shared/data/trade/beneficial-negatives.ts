/**
 * Keywords that indicate a negative mod value is beneficial (more negative = better).
 * Mods matching these go in `max` in the trade query.
 * Everything else negative defaults to `min` (less negative = better).
 */
export const BENEFICIAL_NEGATIVE_KEYWORDS = [
  /\bon you\b/i,
  /\bto you\b/i,
  /\byou take\b/i,
  /\bmana cost\b/i,
  /\battribute requirements\b/i,
  /\breflected\b/i,
  /\bcharges? per use\b/i,
  /\bcharges? used\b/i,
  /\benemy\b/i,
  /\benemies\b/i,
]
