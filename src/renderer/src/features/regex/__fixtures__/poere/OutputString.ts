/* Verbatim copy of poe.re's src/utils/OutputString.ts (veiset/poe-vendor-string),
 * used as a parity reference only. The single change from upstream is the
 * regexGems import path. Do not "fix" or refactor this file - drift from upstream
 * is exactly what the parity test exists to catch. */

import { regexGems } from '@shared/data/regex/vendor/gems/Generated.Gems.English'

export interface PoeStringSettings {
  anyThreeLink: boolean
  anyFourLink: boolean
  anyFiveLink: boolean
  anySixLink: boolean
  anySixSocket: boolean
  movement: {
    ten: boolean
    fifteen: boolean
  }
  colors: {
    rrr: boolean
    ggg: boolean
    bbb: boolean

    rrA: boolean
    ggA: boolean
    bbA: boolean

    ggr: boolean
    ggb: boolean
    rrg: boolean
    rrb: boolean
    bbg: boolean
    bbr: boolean

    rgb: boolean

    raa: boolean
    gaa: boolean
    baa: boolean

    rr: boolean
    gg: boolean
    bb: boolean

    rb: boolean
    gr: boolean
    bg: boolean

    specLink: boolean
    specLinkColors: {
      r: number | undefined
      g: number | undefined
      b: number | undefined
    }
  }
  plusGems: {
    lightning: boolean
    fire: boolean
    cold: boolean
    phys: boolean
    chaos: boolean
    any: boolean
  }
  damage: {
    phys: boolean
    firemult: boolean
    coldmult: boolean
    chaosmult: boolean
  }
  weapon: {
    sceptre: boolean
    mace: boolean
    axe: boolean
    sword: boolean
    bow: boolean
    claw: boolean
    dagger: boolean
    staff: boolean
    wand: boolean
    shield: boolean
  }
  gems: number[] // GeneratedGems keys
}

export function generateResultString(settings: PoeStringSettings): string {
  let result = ''
  result = addExpression(result, generate6Socket(settings))
  result = addExpression(result, generate4LinkStr(settings))
  result = addExpression(result, generate5LinkStr(settings))
  result = addExpression(result, generate6LinkStr(settings))
  result = addExpression(result, generateSpecLinkStr(settings))
  result = addExpression(result, simplify(generate3LinkStr(settings)))
  result = addExpression(result, generate2Link(settings))
  result = addExpression(result, movementStr(settings))
  result = addExpression(result, plusGemsStr(settings))
  result = addExpression(result, generateWeaponDamage(settings))
  result = addExpression(result, generateWeaponType(settings))
  result = addExpression(result, generateGems(settings))
  result = simplifyRBG(result)
  // fix for quoted regexes
  if (result.match('"| ')) {
    result = result.replaceAll('"', '')
    result = `"${result}"`
  }
  return result
}

export function generateWarnings(settings: PoeStringSettings): string | undefined {
  let warnings = ''
  if (plusGemsStr(settings) && settings.weapon.wand) {
    warnings += 'All wands will be displayed [conflict: +1 wand & weapon base=wand].'
  }
  const usesVendorGems = !!generateGems(settings)
  if (usesVendorGems && generateWeaponType(settings)) {
    warnings += 'Undesired gems will be displayed [conflict: weapon types & vendor gems]'
  }
  if (usesVendorGems && settings.damage.phys) {
    warnings += 'Heavy Strike will be displayed [conflict: phys damage & vendor gems]'
  }
  return warnings ?? undefined
}

export function generate6Socket(settings: PoeStringSettings): string {
  return settings.anySixSocket ? '(\\w\\W){5}' : ''
}

export function generate3LinkStr(settings: PoeStringSettings): string {
  const colors = settings.colors
  const { rrr, ggg, bbb, rrg, rrb, ggr, ggb, bbr, bbg, rgb, rrA, ggA, bbA, raa, baa, gaa } = colors

  let result = ''
  if (settings.anyThreeLink) {
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

export function generate4LinkStr(settings: PoeStringSettings): string {
  return settings.anyFourLink ? '-\\w-.-' : ''
}

export function generate5LinkStr(settings: PoeStringSettings): string {
  return settings.anyFiveLink ? '(-\\w){4}' : ''
}

export function generate6LinkStr(settings: PoeStringSettings): string {
  return settings.anySixLink ? '(-\\w){5}' : ''
}

export function generateSpecLinkStr(settings: PoeStringSettings): string {
  if (!settings.colors.specLink) return ''
  const { r, g, b } = settings.colors.specLinkColors
  if ((r === 0 || r === undefined) && (g === 0 || g === undefined) && (b === 0 || b === undefined)) return ''
  const lastColor = b === 0 && g === 0 ? 'r' : b === 0 ? 'g' : 'b'
  let result = 'ts:.+'
  if (r && r > 0) {
    result += lastColor === 'r' ? `(\\S*r){${r}}` : `(?=(\\S*r){${r}})`
  }
  if (g && g > 0) {
    result += lastColor === 'g' ? `(\\S*g){${g}}` : `(?=(\\S*g){${g}})`
  }
  if (b && b > 0) {
    result += `(\\S*b){${b}}`
  }
  return result
}

function oneAndAnyAny(c: string): string {
  return `.-.-${c}|.-${c}-.|${c}-.-.`
}

export function generate2Link(settings: PoeStringSettings) {
  const { rr, gg, bb, rb, gr, bg } = settings.colors
  let result = ''
  if (rr) result = addExpression(result, 'r-r')
  if (gg) result = addExpression(result, 'g-g')
  if (bb) result = addExpression(result, 'b-b')
  if (rb) result = addExpression(result, 'r-b|b-r')
  if (gr) result = addExpression(result, 'g-r|r-g')
  if (bg) result = addExpression(result, 'b-g|g-b')

  return result
}

export function simplifyRBG(result: string): string {
  return result.replaceAll(/([rgb])-(\[rgb])-([rgb])/g, '$1-.-$3')
}

function twoAndOne(b: string, s2: string): string {
  return `${b}-${b}-${s2}|${b}-${s2}-${b}|${s2}-${b}-${b}`
}

function twoAndAny(b: string) {
  return `${b}-${b}-|-${b}-${b}|${b}-[rgb]-${b}`
}

export function simplify(search: string): string {
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

// r-r-|-r-r|r-.-r|g-g-|-g-g|g-.-g -> ([rg]-){2}r|([rg]-){2}g
// r-r-|-r-r|r-.-r|g-g-|-g-g|g-.-g|b-b-|-b-b|b-.-b -> ([rgb]-){2}r|([rgb]-){2}g|([rgb]-){2}b
export function simplifyCCACCA() {}

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
// return `${b}-${b}-|-${b}-${b}|${b}-[rgb]-${b}`
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

export function addExpression(str: string, textToAdd: string | undefined): string {
  if (textToAdd === undefined || textToAdd.length === 0) {
    return str
  }
  return str?.length === 0 ? textToAdd : `${str}|${textToAdd}`
}

export function movementStr(settings: PoeStringSettings): string {
  const { ten, fifteen } = settings.movement
  let result = ''
  if (ten) result = addExpression(result, 'Runn')
  if (fifteen) result = addExpression(result, 'rint')
  return result
}

export function plusGemsStr(settings: PoeStringSettings): string {
  const { lightning, chaos, cold, fire, phys, any } = settings.plusGems
  if (any || (lightning && chaos && cold && fire && phys)) return '"ll g"'
  let result = ''
  if (fire) result = addExpression(result, 'me Sh')
  if (cold) result = addExpression(result, 'singe')
  if (lightning) result = addExpression(result, 'derha')
  if (chaos) result = addExpression(result, 'Lord')
  if (phys) result = addExpression(result, 'Litho')
  return result
}

export function generateWeaponDamage(settings: PoeStringSettings): string {
  const { phys, firemult, coldmult, chaosmult } = settings.damage
  let result = ''
  if (phys) result = addExpression(result, 'Glint|Heav')
  if (firemult) result = addExpression(result, 'Earn')
  if (coldmult) result = addExpression(result, 'Incl')
  if (chaosmult) result = addExpression(result, 'Wani')

  return result
}

export function generateWeaponType(settings: PoeStringSettings): string {
  const { sceptre, mace, axe, sword, bow, claw, dagger, staff, wand, shield } = settings.weapon
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
  } else if (result) {
    return `s:.+${result}`
  } else {
    return ''
  }
}

export function generateGems(settings: PoeStringSettings): string {
  if (!settings.gems.length) {
    return ''
  }
  const tokensById = new Map(regexGems.tokens.map((token) => [token.id, token.regex]))

  const gems = settings.gems.map((id) => tokensById.get(id)).filter((e) => e !== null) as string[]

  return gems.reduce((expr, gemKey) => addExpression(expr, gemKey as string))
}
