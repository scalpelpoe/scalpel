/** A chance clause the trade API folds out of the stat text it publishes:
 *  "Melee Hits have 11% chance to Fortify" is indexed as the clause-less
 *  "Melee Hits Fortify" (stat_1166417447), with the chance still filterable as
 *  that stat's value. Covers "have #%" and "has a #%" ("Your Mark has a 10%
 *  chance to Transfer to ..."). Deliberately not anchored at `^` -- a leading
 *  "#% chance to " is a different fold, handled as an ordinary text variant. */
const FOLDED_CHANCE_RE = /\b(?:have|has) (?:an? )?(\d+(?:\.\d+)?)% chance to /i

/** Candidate clause-less texts for a mod of the shape above, plus the chance
 *  itself, or null when the mod isn't that shape. Two candidates because the
 *  trade text sometimes re-conjugates the verb the clause governed ("... chance
 *  to Transfer to another Enemy" -> "Transfers to another Enemy") and sometimes
 *  leaves it alone ("... chance to Fortify" -> "Fortify"). */
function foldedChanceForms(text: string): { texts: string[]; value: number } | null {
  const m = FOLDED_CHANCE_RE.exec(text)
  if (!m) return null
  const head = text.slice(0, m.index)
  const tail = text.slice(m.index + m[0].length)
  const texts = [head + tail]
  const conjugated = tail.replace(/^[A-Za-z]+/, '$&s')
  if (conjugated !== tail) texts.push(head + conjugated)
  return { texts, value: parseFloat(m[1]) }
}

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
  // "fewer" <-> "additional": the trade API stores "Require # fewer enemies to be
  // Surrounded" as its positive inverse "Require # additional enemies to be
  // Surrounded" with a negative value. Only fewer->additional is generated (not the
  // reverse) so the many ordinary "additional <noun>" mods aren't given nonsense
  // "fewer" variants. The matcher negates the value when matching this way.
  if (/\bfewer\b/i.test(text)) {
    variants.push(text.replace(/\bfewer\b/gi, 'additional'))
  }
  // Common PoE plural -> singular transformations
  // "X% per Y% Overcapped Z" -> "N% of Overcapped Z" (trade API uses a different wording)
  const perOvercapMatch = text.match(/^(.+?) \d+% per \d+% Overcapped (.+)$/)
  if (perOvercapMatch) {
    variants.push(`${perOvercapMatch[1]} 0% of Overcapped ${perOvercapMatch[2]}`)
  }

  // "N additional" -> "an additional" (trade API uses "an" where clipboard has the number).
  // The clipboard also pluralizes the noun head ("2 additional waves of Hiveborn Monsters",
  // "3 additional Rare Monsters when Stabilised", "120 additional seconds to collapse") while
  // the trade stat keeps it singular ("an additional wave of Hiveborn Monsters", "an additional
  // Rare Monster when Stabilised", "an additional second to collapse"). So also emit a variant
  // that singularizes the noun head: the run of words after "an additional" up to the next
  // word, dropping the trailing 's' from the first plural word in that run (the noun, e.g.
  // "Rare Monsters" -> "Rare Monster"). Naive -s is sufficient for the regular plurals these
  // tablet count-mods use; an irregular plural (-es) would need a special case below.
  if (/\b\d+ additional\b/i.test(text)) {
    const an = text.replace(/\b\d+ additional\b/i, 'an additional')
    variants.push(an)
    const singular = an.replace(/\b(an additional (?:\w+ )*?\w+?)s\b/i, '$1')
    if (singular !== an) variants.push(singular)
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
    // Inverse of Sockets->Socket below: trade stores "Has # Abyssal Sockets" (always
    // plural) while a single-socket Stygian Vise clipboard reads "Has 1 Abyssal Socket".
    [/Abyssal Socket(?!s)\b/gi, 'Abyssal Sockets'],
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
  // A "#% chance to X" mod that rolled 100% is printed by the game without the
  // qualifier: the trade stat "Monsters have #% chance to Hinder on Hit with
  // Spells" arrives from the clipboard as "Monsters Hinder on Hit with Spells".
  // Chart suffixes are the first content to roll these at 100%. Re-inserting the
  // qualifier WITH the implied value lets the normal numeric capture read the 100
  // back out, so no special-casing is needed downstream. Pushed last because 26
  // explicit stats genuinely read "Monsters ..." with no chance component (e.g.
  // "Monsters Poison on Hit") -- the matcher returns on the first variant that
  // matches, so those still resolve to their own stat on the unmodified text.
  if (/^Monsters (?!have )/i.test(text)) {
    variants.push(text.replace(/^Monsters /i, 'Monsters have 100% chance to '))
  }

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

export { foldedChanceForms, generateTextVariants }
