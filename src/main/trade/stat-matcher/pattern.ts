// Build regex patterns from stat text: "+# to maximum Life" -> /^\+(\d+(?:\.\d+)?) to maximum Life$/
function statTextToPattern(text: string): RegExp {
  // Normalize whitespace (including `\n` between multi-line stat parts) to a single
  // space before escaping, so a two-line crafted mod like
  //   "Trigger a Socketed Spell ... Cooldown\nSpells Triggered this way ..."
  // matches regardless of whether the caller joined its lines with `\n` or ` `.
  // Callers also normalize their input text to a single space before `.match(pattern)`.
  const normalized = text.replace(/\s+/g, ' ')
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#/g, '(.+?)')
  return new RegExp(`^${escaped}$`, 'i')
}

/** Validates a `(.+?)` capture as a numeric value worth parsing. Allows an
 *  optional leading sign because PoE2's trade stat texts omit the "+" that
 *  PoE2 item clipboard text includes ("# to maximum Life" vs "+50 to maximum
 *  Life"), so the capture comes back as "+50" -- parseFloat handles that
 *  fine, but we still want to reject non-numeric captures like option text. */
const NUMERIC_CAPTURE = /^[+-]?\d+(?:\.\d+)?$/

/** Relaxed pattern: also treat hardcoded numbers in stat text as wildcards.
 *  Used as fallback when exact matching fails -- handles cases where
 *  trade API has a fixed number but the item text has a different value. */
function statTextToRelaxedPattern(text: string): RegExp {
  // Same whitespace normalization as statTextToPattern -- see that function for details.
  const normalized = text.replace(/\s+/g, ' ')
  let escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/#/g, '(.+?)')
  // Replace hardcoded numbers (e.g. "50%", "20") with capture groups
  escaped = escaped.replace(/\d+(?:\\\.\d+)?/g, '(.+?)')
  return new RegExp(`^${escaped}$`, 'i')
}

export { NUMERIC_CAPTURE, statTextToPattern, statTextToRelaxedPattern }
