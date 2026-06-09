/**
 * Generate singular/alternate text variants for plural PoE mod text.
 * The trade API uses singular stat text but the clipboard may have plural forms.
 */
function generateTextVariants(text: string): string[] {
  const variants = [text]
  // Negative mods: "-50% to Lightning Resistance" or "have -9 to Total Mana Cost"
  // needs to match stat pattern "+#%" or "+# to". Replace all -N with +N.
  if (/-\d/.test(text)) {
    variants.push(text.replace(/-(\d)/g, '+$1'))
  }
  // "reduced" <-> "increased" and "less" <-> "more" -- trade API may use either form
  if (/\breduced\b/i.test(text)) {
    variants.push(text.replace(/\breduced\b/i, 'increased'))
  }
  if (/\bincreased\b/i.test(text)) {
    variants.push(text.replace(/\bincreased\b/i, 'reduced'))
  }
  if (/\bless\b/i.test(text)) {
    variants.push(text.replace(/\bless\b/i, 'more'))
  }
  if (/\bmore\b/i.test(text)) {
    variants.push(text.replace(/\bmore\b/i, 'less'))
  }
  // Common PoE plural -> singular transformations
  // "X% per Y% Overcapped Z" -> "N% of Overcapped Z" (trade API uses a different wording)
  const perOvercapMatch = text.match(/^(.+?) \d+% per \d+% Overcapped (.+)$/)
  if (perOvercapMatch) {
    variants.push(`${perOvercapMatch[1]} 0% of Overcapped ${perOvercapMatch[2]}`)
  }

  // "N additional" -> "an additional" (trade API uses "an" where clipboard has the number)
  if (/\b\d+ additional\b/i.test(text)) {
    variants.push(text.replace(/\b\d+ additional\b/i, 'an additional'))
  }

  // "an additional <Noun>" -> "1 additional <Noun>s" (clipboard says "an additional Arrow"
  // but the trade API stores the numeric form: "Bow Attacks fire # additional Arrows").
  // Naive +s pluralization is sufficient for the PoE mods that hit this path (Arrow,
  // Projectile, Curse, Modifier) -- if an irregular plural shows up later, special-case it.
  const anAdditionalMatch = text.match(/\ban additional ([A-Za-z]+)\b/i)
  if (anAdditionalMatch) {
    const noun = anAdditionalMatch[1]
    variants.push(text.replace(/\ban additional [A-Za-z]+\b/i, `1 additional ${noun}s`))
  }

  // PoE2 trade folds an always-100% "chance to <effect>" mod into a valueless binary
  // stat ("Blind Chilled enemies on Hit"), but the clipboard still prints the chance
  // ("100% chance to Blind Chilled enemies on Hit", or higher when corruption over-rolls
  // it). Strip the leading "#% chance to " so the binary stat is reachable. Only used as
  // a fallback: a real "#% chance to ..." stat matches the unstripped text (variant 0)
  // first, so this never shadows a genuine rollable chance stat. (The Pandemonius)
  const chanceToMatch = text.match(/^\d+(?:\.\d+)?% chance to (.+)$/i)
  if (chanceToMatch) {
    variants.push(chanceToMatch[1])
  }

  // Oxford comma: the PoE2 clipboard writes three-item lists as "A, B, and C"
  // (e.g. "Global Armour, Evasion, and Energy Shield") but the trade API stat
  // text drops the comma before "and" ("A, B and C"). Strip it so they match.
  if (/,\s+and\b/i.test(text)) {
    variants.push(text.replace(/,(\s+and\b)/gi, '$1'))
  }

  const replacements: Array<[RegExp, string]> = [
    [/Flasks constantly apply their Flask Effects/g, 'Flask constantly applies its Flask Effect'],
    [/Flasks constantly apply their/g, 'Flask constantly applies its'],
    [/Skills are Jewel Sockets/g, 'Skill is a Jewel Socket'],
    [/Flasks/gi, 'Flask'],
    // Trade API stores the singular "Has # Charm Slot" / "# Charm Slot"; an item
    // with 2+ slots reads "Charm Slots", so without this it never matches.
    [/Charm Slots/gi, 'Charm Slot'],
    // Tablet implicits ("Adds Abysses to a Map \n# use remaining") are stored
    // singular by the trade API, but a multi-use tablet's clipboard reads
    // "10 uses remaining" -- without this the plural form never matches and the
    // tablet's only implicit is dropped. Single-use tablets already say "use".
    [/uses remaining/gi, 'use remaining'],
    [/Charges/gi, 'Charge'],
    [/Effects/gi, 'Effect'],
    [/Sockets/gi, 'Socket'],
    [/Skills are/gi, 'Skill is'],
    [/apply their/gi, 'applies its'],
    [/have /gi, 'has '],
    [/the matching modifier/g, 'matching modifier'],
  ]
  // Apply replacements to ALL existing variants (not just original text)
  // so that multiple transforms can stack (e.g. "N additional" + "effects"->"effect")
  const baseVariants = [...variants]
  for (const [pattern, replacement] of replacements) {
    for (const v of baseVariants) {
      if (pattern.test(v)) {
        const replaced = v.replace(pattern, replacement)
        if (!variants.includes(replaced)) variants.push(replaced)
      }
    }
  }
  return variants
}

export { generateTextVariants }
