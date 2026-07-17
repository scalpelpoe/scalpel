/** Faithful port of poe.re's vendor regex builder (src/utils/OutputString.ts).
 *  Mirrors its output bug-for-bug; see vendor-poe1-engine.test.ts for the parity
 *  check against the verbatim fixture. Quirks preserved deliberately:
 *  - simplifyRBG's `(\[rgb])` middle group can never match (upstream escaping bug)
 *  - the final quote-wrap triggers when the result contains a quote OR a space
 *    (`result.match('"| ')` is the regex `"|<space>`)
 *  - generateGems reduces without an initial value and lets unknown ids through
 *    its `!== null` filter as undefined (harmless via the UI; kept as-is)
 *  - the emission order of 3L color terms (ggb before ggr, bbg before bbr) feeds
 *    the simplify passes' exact-substring matching and must not be "tidied"
 *  The specLink ("Other Links") feature is dropped per spec; upstream emits ''
 *  for it when disabled, so omitting the call preserves parity. */

import { regexGems } from '@shared/data/regex/vendor/gems/Generated.Gems.English'
import type { VendorPoe1Settings } from '@shared/data/regex/vendor-poe1-toggles'
export type { VendorPoe1Settings } from '@shared/data/regex/vendor-poe1-toggles'

const GEM_REGEX_BY_ID = new Map(regexGems.tokens.map((token) => [token.id, token.regex]))

export function buildVendorPoe1Regex(s: VendorPoe1Settings): string {
  let result = ''
  result = addExpression(result, sixSocket(s))
  result = addExpression(result, fourLink(s))
  result = addExpression(result, fiveLink(s))
  result = addExpression(result, sixLink(s))
  result = addExpression(result, simplify(threeLink(s)))
  result = addExpression(result, twoLink(s))
  result = addExpression(result, movementTerm(s))
  result = addExpression(result, plusGemsTerm(s))
  result = addExpression(result, weaponDamageTerm(s))
  result = addExpression(result, weaponTypeTerm(s))
  result = addExpression(result, gemsTerm(s))
  result = simplifyRBG(result)
  // fix for quoted regexes
  if (result.match('"| ')) {
    result = result.replaceAll('"', '')
    result = `"${result}"`
  }
  return result
}

/** One term per non-empty group, AND'd with a single space (the in-game search
 *  ANDs space-separated terms). Scalpel extension - poe.re has no grouping. */
export function buildVendorPoe1GroupsRegex(groups: VendorPoe1Settings[]): string {
  return groups
    .map((g) => buildVendorPoe1Regex(g))
    .filter((e) => e !== '')
    .join(' ')
}

/** Upstream generateWarnings, evaluated per group and deduplicated. Message
 *  strings are verbatim from poe.re. Null when there is nothing to warn about. */
export function buildVendorPoe1Warnings(groups: VendorPoe1Settings[]): string | null {
  const messages: string[] = []
  for (const g of groups) {
    if (plusGemsTerm(g) && g.weapon.wand) {
      messages.push('All wands will be displayed [conflict: +1 wand & weapon base=wand].')
    }
    const usesGems = !!gemsTerm(g)
    if (usesGems && weaponTypeTerm(g)) {
      messages.push('Undesired gems will be displayed [conflict: weapon types & vendor gems]')
    }
    if (usesGems && g.damage.phys) {
      messages.push('Heavy Strike will be displayed [conflict: phys damage & vendor gems]')
    }
  }
  const unique = Array.from(new Set(messages))
  return unique.length > 0 ? unique.join(' ') : null
}

function sixSocket(s: VendorPoe1Settings): string {
  return s.links.socket6 ? '(\\w\\W){5}' : ''
}

function fourLink(s: VendorPoe1Settings): string {
  return s.links.any4 ? '-\\w-.-' : ''
}

function fiveLink(s: VendorPoe1Settings): string {
  return s.links.any5 ? '(-\\w){4}' : ''
}

function sixLink(s: VendorPoe1Settings): string {
  return s.links.any6 ? '(-\\w){5}' : ''
}

function threeLink(s: VendorPoe1Settings): string {
  const { rrr, ggg, bbb, rrg, rrb, ggr, ggb, bbr, bbg, rgb, rrA, ggA, bbA, raa, baa, gaa } = s.colors3

  let result = ''
  if (s.links.any3) {
    result = addExpression(result, '-\\w-')
    return result
  }
  if (rrr) result = addExpression(result, 'r-r-r')
  if (ggg) result = addExpression(result, 'g-g-g')
  if (bbb) result = addExpression(result, 'b-b-b')

  if (rrA) result = addExpression(result, twoAndAny('r'))
  if (ggA) result = addExpression(result, twoAndAny('g'))
  if (bbA) result = addExpression(result, twoAndAny('b'))

  if (rrg) result = addExpression(result, twoAndOne('r', 'g'))
  if (rrb) result = addExpression(result, twoAndOne('r', 'b'))
  if (ggb) result = addExpression(result, twoAndOne('g', 'b'))
  if (ggr) result = addExpression(result, twoAndOne('g', 'r'))
  if (bbg) result = addExpression(result, twoAndOne('b', 'g'))
  if (bbr) result = addExpression(result, twoAndOne('b', 'r'))

  if (rgb) result = addExpression(result, ':.*(?=\\S*r)(?=\\S*g)(?=\\S*b)')
  if (raa) result = addExpression(result, oneAndAnyAny('r'))
  if (gaa) result = addExpression(result, oneAndAnyAny('g'))
  if (baa) result = addExpression(result, oneAndAnyAny('b'))
  return result
}

function twoLink(s: VendorPoe1Settings): string {
  const { rr, gg, bb, rb, gr, bg } = s.colors2
  let result = ''
  if (rr) result = addExpression(result, 'r-r')
  if (gg) result = addExpression(result, 'g-g')
  if (bb) result = addExpression(result, 'b-b')
  if (rb) result = addExpression(result, 'r-b|b-r')
  if (gr) result = addExpression(result, 'g-r|r-g')
  if (bg) result = addExpression(result, 'b-g|g-b')
  return result
}

function movementTerm(s: VendorPoe1Settings): string {
  const { ten, fifteen } = s.movement
  let result = ''
  if (ten) result = addExpression(result, 'Runn')
  if (fifteen) result = addExpression(result, 'rint')
  return result
}

function plusGemsTerm(s: VendorPoe1Settings): string {
  const { lightning, chaos, cold, fire, phys, any } = s.plusGems
  if (any || (lightning && chaos && cold && fire && phys)) return '"ll g"'
  let result = ''
  if (fire) result = addExpression(result, 'me Sh')
  if (cold) result = addExpression(result, 'singe')
  if (lightning) result = addExpression(result, 'derha')
  if (chaos) result = addExpression(result, 'Lord')
  if (phys) result = addExpression(result, 'Litho')
  return result
}

function weaponDamageTerm(s: VendorPoe1Settings): string {
  const { phys, firemult, coldmult, chaosmult } = s.damage
  let result = ''
  if (phys) result = addExpression(result, 'Glint|Heav')
  if (firemult) result = addExpression(result, 'Earn')
  if (coldmult) result = addExpression(result, 'Incl')
  if (chaosmult) result = addExpression(result, 'Wani')
  return result
}

function weaponTypeTerm(s: VendorPoe1Settings): string {
  const { sceptre, mace, axe, sword, bow, claw, dagger, staff, wand, shield } = s.weapon
  let result = ''
  if (sceptre) result = addExpression(result, 'sc')
  if (mace) result = addExpression(result, 'mac')
  if (axe) result = addExpression(result, 'ax')
  if (sword) result = addExpression(result, 'sw')
  if (bow) result = addExpression(result, 'bow')
  if (claw) result = addExpression(result, 'cl')
  if (dagger) result = addExpression(result, 'da')
  if (staff) result = addExpression(result, 'stave')
  if (wand) result = addExpression(result, 'wa')
  if (shield) result = addExpression(result, 'sh')
  if (result.includes('|')) {
    return `s:.+(${result})`
  }
  if (result) {
    return `s:.+${result}`
  }
  return ''
}

function gemsTerm(s: VendorPoe1Settings): string {
  if (!s.gems.length) {
    return ''
  }
  const gems = s.gems.map((id) => GEM_REGEX_BY_ID.get(id)).filter((e) => e !== null) as string[]
  return gems.reduce((expr, gemKey) => addExpression(expr, gemKey as string))
}

function twoAndOne(b: string, s2: string): string {
  return `${b}-${b}-${s2}|${b}-${s2}-${b}|${s2}-${b}-${b}`
}

function twoAndAny(b: string): string {
  return `${b}-${b}-|-${b}-${b}|${b}-[rgb]-${b}`
}

function oneAndAnyAny(c: string): string {
  return `.-.-${c}|.-${c}-.|${c}-.-.`
}

function addExpression(str: string, textToAdd: string | undefined): string {
  if (textToAdd === undefined || textToAdd.length === 0) {
    return str
  }
  return str?.length === 0 ? textToAdd : `${str}|${textToAdd}`
}

function simplifyRBG(result: string): string {
  return result.replaceAll(/([rgb])-(\[rgb])-([rgb])/g, '$1-.-$3')
}

function simplify(search: string): string {
  let result = search
  if (result.includes('|-[rgb]-|') || result.startsWith('-[rgb]-|')) return '-[rgb]-'

  result = simplifyABABAB(result, 'g', 'r')
  result = simplifyABABAB(result, 'g', 'b')
  result = simplifyABABAB(result, 'r', 'g')
  result = simplifyABABAB(result, 'r', 'b')
  result = simplifyABABAB(result, 'b', 'r')
  result = simplifyABABAB(result, 'b', 'g')

  result = removeCCCWhenCCA(result, 'r', 'g', 'b')
  result = removeCCCWhenCCA(result, 'g', 'b', 'r')
  result = removeCCCWhenCCA(result, 'b', 'r', 'g')

  result = simplifyCCACCB(result, 'r', 'g', 'b')
  result = simplifyCCACCB(result, 'g', 'r', 'b')
  result = simplifyCCACCB(result, 'b', 'r', 'g')

  result = simplifyTwoAndTwo(result, 'g', 'r')
  result = simplifyTwoAndTwo(result, 'r', 'b')
  result = simplifyTwoAndTwo(result, 'b', 'g')

  result = simplifyThreeAndTwoAndAny(result, 'r', 'g', 'b')
  result = simplifyThreeAndTwoAndAny(result, 'g', 'r', 'b')
  result = simplifyThreeAndTwoAndAny(result, 'b', 'g', 'r')

  result = simplifyCCCWhenCCB(result, 'g', 'r')
  result = simplifyCCCWhenCCB(result, 'g', 'b')
  result = simplifyCCCWhenCCB(result, 'b', 'r')
  result = simplifyCCCWhenCCB(result, 'b', 'g')
  result = simplifyCCCWhenCCB(result, 'r', 'g')
  result = simplifyCCCWhenCCB(result, 'r', 'b')

  const unique = Array.from(new Set(result.split('|')))
  return unique.join('|')
}

// r-r-r|g-g-g|r-r-g|r-g-r|g-r-r|g-g-r|g-r-g|r-g-g -> [rg]-[rg]-[rg]
function simplifyABABAB(result: string, c: string, c2: string): string {
  let r = result
  const search1 = `${c}-${c}-${c}|${c2}-${c2}-${c2}|${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}|${c2}-${c2}-${c}|${c2}-${c}-${c2}|${c}-${c2}-${c2}`
  const searchTerms = search1.split('|')
  if (searchTerms.every((v) => result.includes(v))) {
    const shortened = `[${c}${c2}]-[${c}${c2}]-[${c}${c2}]`
    r = r
      .split('|')
      .filter((v) => !searchTerms.some((t) => v === t))
      .join('|')
    r = addExpression(r, shortened)
  }
  return r
}

// r-r-g|r-g-r|g-r-r|r-r-b|r-b-r|b-r-r -> r-r-[gb]|r-[gb]-r|[gb]-r-r
function simplifyCCACCB(result: string, c: string, c2: string, c3: string): string {
  let r = result
  const search1 = `${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}`
  const search2 = `${c}-${c}-${c3}|${c}-${c3}-${c}|${c3}-${c}-${c}`
  if (result.includes(search1) && result.includes(search2)) {
    r = r
      .split('|')
      .filter((v) => !v.match(`${search1}|${search2}`))
      .join('|')
    r = addExpression(r, `${c}-${c}-[${c2}${c3}]|${c}-[${c2}${c3}]-${c}|[${c2}${c3}]-${c}-${c}`)
  }
  return r
}

// g-g-g|g-g-r|g-r-g|r-g-g -> g-g-r|g-[rg]-g|r-g-g
function simplifyCCCWhenCCB(result: string, c: string, c2: string): string {
  let r = result
  const search1 = `${c}-${c}-${c}`
  const search2 = `${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}`
  if (result.includes(search1) && result.includes(search2)) {
    r = r
      .split('|')
      .filter((v) => !v.match(`${search1}|${search2}`))
      .join('|')
    r = addExpression(r, `${c}-${c}-${c2}|${c}-[${c}${c2}]-${c}|${c2}-${c}-${c}`)
  }
  return r
}

// r-r-g|r-g-r|g-r-r|g-g-r|g-r-g|g-g-r -> g-[gr]-r|r-[gr]-g|g-r-g|r-g-r
function simplifyTwoAndTwo(result: string, c: string, c2: string): string {
  let r = result
  const search1 = `${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}`
  const search2 = `${c2}-${c2}-${c}|${c2}-${c}-${c2}|${c}-${c2}-${c2}`
  if (result.includes(search1) && result.includes(search2)) {
    r = r
      .split('|')
      .filter((v) => !v.match(`${search1}|${search2}`))
      .join('|')
    r = addExpression(r, `${c}-[${c}${c2}]-${c2}|${c2}-[${c}${c2}]-${c}|${c}-${c2}-${c}|${c2}-${c}-${c2}`)
  }
  return r
}

// r-r-r|r-r-|-r-r|r-[rgb]-r -> r-r-|-r-r|r-[rgb]-r
function removeCCCWhenCCA(result: string, c: string, c2: string, c3: string): string {
  let r = result
  if (result.includes(`${c}-${c}-|-${c}-${c}|${c}-[rgb]-${c}`)) {
    const replaceStr = `${c}-${c}-${c}|${c}-${c}-[${c2}${c3}]|[${c2}${c3}]-${c}-${c}|${c}-[${c2}${c3}]-${c}`
    r = r
      .split('|')
      .filter((v) => !v.match(new RegExp(replaceStr)))
      .join('|')
  }
  return r
}

// r-r-r|r-r-g|r-b-r|g-r-r|r-r-b|r-b-r|r... -> r-r-|-r-r|r-[rgb]-r
function simplifyThreeAndTwoAndAny(result: string, c: string, c2: string, c3: string): string {
  let r = result
  if (result.includes(`${c}-${c}-${c}`) && result.includes(`${c}-${c}-${c2}`) && result.includes(`${c}-${c}-${c3}`)) {
    const replaceStr = `${c}-${c}-${c}|${c}-${c}-${c2}|${c}-${c2}-${c}|${c2}-${c}-${c}|${c}-${c}-${c3}|${c}-${c3}-${c}|${c3}-${c}-${c}|${c}-${c}-|-${c}-${c}|${c}-[rgb]-${c}`
    r = r
      .split('|')
      .filter((v) => !v.match(new RegExp(replaceStr)))
      .join('|')
    r = addExpression(r, twoAndAny(c))
  }
  return r
}
