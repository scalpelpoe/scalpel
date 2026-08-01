/**
 * Chromatic orb maths for Path of Exile 1, 3.29 "Curse of the Allflame".
 *
 * Ported from Siveran's Vorici Chromatic Calculator (CC0):
 *   https://siveran.github.io/calc.html
 *   https://github.com/Siveran/siveran.github.io (src/Main.ts)
 *
 * The pre-3.29 "Mirage" branch and its Vorici bench recipes are deliberately not
 * ported; Scalpel only ever shows Allflame maths.
 *
 * The white-socket constant and the bench recipe costs are Siveran's, derived from
 * crowd-sourced socket data. If he recalibrates upstream, resync here.
 */

export interface Chances {
  r: number
  g: number
  b: number
  w: number
}

// The three hardest numbers to pin down, per Siveran. Unchanged since before 3.29.
const MAX_ON_COLOR = 0.9
const X = 5
const C = 5

/** Per-socket colour weights from a base's attribute requirements, before white
 *  dilution. The three colours sum to 1; `w` is always 0. */
export function getColorChances(str: number, dex: number, int: number): Chances {
  const reqs = [str, dex, int]
  const total = str + dex + int
  if (total <= 0) return { r: 0, g: 0, b: 0, w: 0 }
  const nonZero = reqs.filter((r) => r > 0).length

  // Single requirement, e.g. Vaal Regalia. The on-colour chance approaches
  // MAX_ON_COLOR as the requirement grows; off-colours split what is left.
  if (nonZero === 1) {
    const f = (i: number): number =>
      reqs[i] > 0
        ? (MAX_ON_COLOR * (X + C + reqs[i])) / (total + 3 * X + C)
        : (1 - MAX_ON_COLOR) / 2 + MAX_ON_COLOR * (X / (total + 3 * X + C))
    return { r: f(0), g: f(1), b: f(2), w: 0 }
  }

  // Dual requirement, e.g. Carnal Armour. On-colours split MAX_ON_COLOR by weight,
  // the absent colour takes the whole remainder.
  if (nonZero === 2) {
    const f = (i: number): number => (reqs[i] > 0 ? (MAX_ON_COLOR * reqs[i]) / total : 1 - MAX_ON_COLOR)
    return { r: f(0), g: f(1), b: f(2), w: 0 }
  }

  // Tri requirement, e.g. Atziri's Splendour. Straight proportional split.
  return { r: str / total, g: dex / total, b: int / total, w: 0 }
}

/** Chance that any one socket rolls white. New in 3.29: white is the default, and
 *  higher item level and quality are what buy you colour. */
export function whiteSocketChance(itemLevel: number, quality: number): number {
  const raw = 1 - 0.00375 * Math.max(itemLevel - 14, 1) * (1 + Math.min(quality, 30) / 100)
  return Math.min(Math.max(raw, 0), 1)
}

/** Fold the white chance into the colour weights. The result sums to 1. */
export function diluteChances(rgb: Chances, white: number): Chances {
  const colored = 1 - white
  return { r: rgb.r * colored, g: rgb.g * colored, b: rgb.b * colored, w: white }
}

export type RecipeKey = 'drop' | 'chromatic' | 'trichrome' | 'nonwhite2' | 'nonwhite3' | 'nonwhite4'

export interface RecipeDef {
  key: RecipeKey
  label: string
  /** Colours the recipe guarantees outright, by colour. Trichromatism only. */
  forced: { readonly r: number; readonly g: number; readonly b: number }
  /** Sockets guaranteed non-white but of random colour. */
  guaranteedNonWhite: number
  /** Cost in chromatic orbs, or null when the recipe is not chromatic-priced. */
  chromCost: number | null
  /** Cost in Omens of Trichromatism. */
  omenCost: number
}

const NO_FORCED = { r: 0, g: 0, b: 0 } as const

export const RECIPES: readonly RecipeDef[] = [
  { key: 'chromatic', label: 'Chromatic Orb', forced: NO_FORCED, guaranteedNonWhite: 1, chromCost: 1, omenCost: 0 },
  { key: 'nonwhite2', label: '2 Non-White', forced: NO_FORCED, guaranteedNonWhite: 2, chromCost: 5, omenCost: 0 },
  { key: 'nonwhite3', label: '3 Non-White', forced: NO_FORCED, guaranteedNonWhite: 3, chromCost: 20, omenCost: 0 },
  { key: 'nonwhite4', label: '4 Non-White', forced: NO_FORCED, guaranteedNonWhite: 4, chromCost: 75, omenCost: 0 },
  {
    key: 'trichrome',
    label: 'Omen of Trichromatism',
    forced: { r: 1, g: 1, b: 1 },
    guaranteedNonWhite: 0,
    chromCost: null,
    omenCost: 1,
  },
  { key: 'drop', label: 'Natural roll', forced: NO_FORCED, guaranteedNonWhite: 0, chromCost: null, omenCost: 0 },
]

export interface ChanceInput {
  reqStr: number
  reqDex: number
  reqInt: number
  itemLevel: number
  quality: number
  totalSockets: number
  wantR: number
  wantG: number
  wantB: number
}

export interface RecipeChance {
  recipe: RecipeDef
  chance: number
}

interface Target {
  r: number
  g: number
  b: number
  w: number
}

const ZERO_TARGET: Target = { r: 0, g: 0, b: 0, w: 0 }

function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

/** Chance of one specific socket multiset, where `rgbOnlyTarget` counts the sockets a
 *  recipe forced non-white (drawn from the undiluted weights) and `target` counts the
 *  rest. Both are unordered, so each is multiplied by its distinct-arrangement count. */
function targetChance(full: Chances, rgbOnly: Chances, target: Target, rgbOnlyTarget: Target): number {
  const rgbOnlyDistinct =
    factorial(rgbOnlyTarget.r + rgbOnlyTarget.g + rgbOnlyTarget.b) /
    (factorial(rgbOnlyTarget.r) * factorial(rgbOnlyTarget.g) * factorial(rgbOnlyTarget.b))
  const distinct =
    factorial(target.r + target.g + target.b + target.w) /
    (factorial(target.r) * factorial(target.g) * factorial(target.b) * factorial(target.w))
  const normal = full.r ** target.r * full.g ** target.g * full.b ** target.b * full.w ** target.w
  const guaranteed = rgbOnly.r ** rgbOnlyTarget.r * rgbOnly.g ** rgbOnlyTarget.g * rgbOnly.b ** rgbOnlyTarget.b
  return rgbOnlyDistinct * distinct * normal * guaranteed
}

type Leaf = (full: Chances, rgbOnly: Chances, target: Target, rgbOnlyTarget: Target) => number

/** Walk every distinct final socket combination that still contains the desired
 *  colours and combine the leaf values. `freeBranch` and `rgbOnlyBranch` keep the
 *  recursion from visiting RGGB and RGBG as separate outcomes. */
function enumerateOutcomes(
  full: Chances,
  rgbOnlyChances: Chances,
  target: Target,
  free: number,
  freeBranch: number,
  rgbOnly: number,
  rgbOnlyBranch: number,
  rgbOnlyTarget: Target,
  leaf: Leaf,
): number {
  const go = (t: Target, f: number, fb: number, ro: number, rob: number, rot: Target): number =>
    enumerateOutcomes(full, rgbOnlyChances, t, f, fb, ro, rob, rot, leaf)

  // Spend the sockets we do not care about, one colour at a time.
  if (free > 0) {
    return (
      (freeBranch <= 1 ? go({ ...target, r: target.r + 1 }, free - 1, 1, rgbOnly, 1, rgbOnlyTarget) : 0) +
      (freeBranch <= 2 ? go({ ...target, g: target.g + 1 }, free - 1, 2, rgbOnly, 1, rgbOnlyTarget) : 0) +
      (freeBranch <= 3 ? go({ ...target, b: target.b + 1 }, free - 1, 3, rgbOnly, 1, rgbOnlyTarget) : 0) +
      go({ ...target, w: target.w + 1 }, free - 1, 4, rgbOnly, 1, rgbOnlyTarget)
    )
  }

  // Reassign already-counted sockets as the recipe's guaranteed non-white ones.
  if (rgbOnly > 0) {
    return (
      (rgbOnlyBranch <= 1 && target.r > 0
        ? go({ ...target, r: target.r - 1 }, free, 0, rgbOnly - 1, 1, { ...rgbOnlyTarget, r: rgbOnlyTarget.r + 1 })
        : 0) +
      (rgbOnlyBranch <= 2 && target.g > 0
        ? go({ ...target, g: target.g - 1 }, free, 0, rgbOnly - 1, 2, { ...rgbOnlyTarget, g: rgbOnlyTarget.g + 1 })
        : 0) +
      (rgbOnlyBranch <= 3 && target.b > 0
        ? go({ ...target, b: target.b - 1 }, free, 0, rgbOnly - 1, 3, { ...rgbOnlyTarget, b: rgbOnlyTarget.b + 1 })
        : 0)
    )
  }

  return leaf(full, rgbOnlyChances, target, rgbOnlyTarget)
}

const chanceLeaf: Leaf = targetChance

/** Probability that two consecutive rolls land on the same outcome. */
const collisionLeaf: Leaf = (full, rgbOnly, target, rgbOnlyTarget) => {
  const t = {
    r: target.r + rgbOnlyTarget.r,
    g: target.g + rgbOnlyTarget.g,
    b: target.b + rgbOnlyTarget.b,
    w: target.w + rgbOnlyTarget.w,
  }
  const unordered = targetChance(full, rgbOnly, target, rgbOnlyTarget)
  const equivalentOrder =
    (factorial(t.r) * factorial(t.g) * factorial(t.b) * factorial(t.w)) / factorial(t.r + t.g + t.b + t.w)
  return unordered * unordered * equivalentOrder
}

/** A chromatic orb cannot reproduce the previous result, so every roll that would have
 *  repeated is retried for free. That lifts the effective per-orb chance. */
function applyChromaticCollision(chance: number, full: Chances, rgbOnly: Chances, totalSockets: number): number {
  const base = enumerateOutcomes(full, rgbOnly, ZERO_TARGET, totalSockets, 1, 0, 1, ZERO_TARGET, collisionLeaf)
  const allWhite = full.w ** totalSockets
  const collisionOnGuaranteed =
    allWhite * enumerateOutcomes(full, rgbOnly, ZERO_TARGET, totalSockets, 1, 1, 1, ZERO_TARGET, collisionLeaf)
  const collision = base + (1 - base) * collisionOnGuaranteed
  return 1 - (1 - chance) ** (1 / (1 - Math.min(collision, 1 - chance)))
}

/** The per-socket colour chances an item actually rolls at, white included. */
export function socketChances(input: ChanceInput): Chances {
  return diluteChances(
    getColorChances(input.reqStr, input.reqDex, input.reqInt),
    whiteSocketChance(input.itemLevel, input.quality),
  )
}

/** Success chance per crafting option for one attempt. Recipes that cannot apply to
 *  this item are omitted rather than reported at zero. */
export function calculateChances(input: ChanceInput): RecipeChance[] {
  const { totalSockets, wantR, wantG, wantB } = input
  const desiredTotal = wantR + wantG + wantB
  if (totalSockets <= 0 || desiredTotal > totalSockets) return []
  if (input.reqStr <= 0 && input.reqDex <= 0 && input.reqInt <= 0) return []
  // itemLevel < 1 would floor to item-level-1 numbers via max(itemLevel - 14, 1)
  // instead of failing loudly, so refuse rather than silently returning plausible-looking
  // wrong numbers.
  if (input.itemLevel < 1) return []
  // Wanting zero coloured sockets makes every outcome a trivial success, so the
  // resulting 100% rows would be meaningless. The reference calculator refuses this too.
  if (desiredTotal === 0) return []

  const rgbOnlyChances = getColorChances(input.reqStr, input.reqDex, input.reqInt)
  const full = diluteChances(rgbOnlyChances, whiteSocketChance(input.itemLevel, input.quality))

  const out: RecipeChance[] = []
  for (const recipe of RECIPES) {
    const fits =
      recipe.guaranteedNonWhite <= totalSockets &&
      recipe.forced.r <= wantR &&
      recipe.forced.g <= wantG &&
      recipe.forced.b <= wantB
    // Trichromatism is still worth offering when you want fewer than all three colours,
    // as long as there are spare sockets to absorb the ones you did not ask for.
    if (!fits && !(recipe.key === 'trichrome' && totalSockets >= 3)) continue

    const target: Target = {
      r: Math.max(0, wantR - recipe.forced.r),
      g: Math.max(0, wantG - recipe.forced.g),
      b: Math.max(0, wantB - recipe.forced.b),
      w: 0,
    }

    let flexible = totalSockets - desiredTotal
    if (recipe.key === 'trichrome') {
      if (wantR === 0) flexible--
      if (wantG === 0) flexible--
      if (wantB === 0) flexible--
      if (flexible < 0) continue
    }

    // The chromatic guarantee only fires when the roll would have been all white, so it
    // buys nothing once more than one coloured socket is wanted.
    const guaranteed = recipe.key === 'chromatic' && desiredTotal > 1 ? 0 : recipe.guaranteedNonWhite

    let chance = enumerateOutcomes(full, rgbOnlyChances, target, flexible, 1, guaranteed, 1, ZERO_TARGET, chanceLeaf)
    if (recipe.key === 'chromatic') {
      chance = applyChromaticCollision(chance, full, rgbOnlyChances, totalSockets)
    }

    out.push({ recipe, chance })
  }
  return out
}

export interface Rates {
  /** Chaos per chromatic orb. */
  chromChaos: number
  /** Chaos per Omen of Trichromatism. */
  omenChaos: number
}

/** Only ever shown in the window before the price fetch lands, or if it fails. */
export const DEFAULT_RATES: Rates = { chromChaos: 1, omenChaos: 300 }

export interface CraftResult {
  key: RecipeKey
  label: string
  /** Colours the recipe guarantees, for the row's socket swatch. */
  forced: { readonly r: number; readonly g: number; readonly b: number }
  chance: number
  /** Averages, i.e. cost / chance. Null when the recipe is not priced in that currency. */
  avgChaos: number | null
  chroms: number | null
  omens: number | null
}

/** Crafting options for one item, cheapest first, with the unpriced natural roll last. */
export function calculateMethods(input: ChanceInput, rates: Rates): CraftResult[] {
  const rows = calculateChances(input).map(({ recipe, chance }): CraftResult => {
    const chroms = recipe.chromCost != null && chance > 0 ? recipe.chromCost / chance : null
    const omens = recipe.omenCost > 0 && chance > 0 ? recipe.omenCost / chance : null
    const avgChaos = chroms != null ? chroms * rates.chromChaos : omens != null ? omens * rates.omenChaos : null
    return { key: recipe.key, label: recipe.label, forced: recipe.forced, chance, avgChaos, chroms, omens }
  })

  rows.sort((a, b) => {
    if (a.avgChaos == null && b.avgChaos == null) return 0
    if (a.avgChaos == null) return 1
    if (b.avgChaos == null) return -1
    return a.avgChaos - b.avgChaos
  })
  return rows
}

export type RecolorNotice = 'no-requirements' | 'no-item-level' | 'no-colors' | null

/** Why the panel cannot show results, if it cannot. Ordered so the most fundamental
 *  problem wins. */
export function recolorNotice(input: ChanceInput): RecolorNotice {
  if (input.reqStr <= 0 && input.reqDex <= 0 && input.reqInt <= 0) return 'no-requirements'
  // White chance runs from 67% to 99.6% across the item level range, so there is no
  // safe guess when the clipboard did not carry one.
  if (input.itemLevel < 1) return 'no-item-level'
  if (input.wantR + input.wantG + input.wantB === 0) return 'no-colors'
  return null
}
