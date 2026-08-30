import type { ScarabCalcState, ScarabCatalog, ScarabCategory, ScarabDef } from './types'

export const STORAGE_KEY = 'scarab-atlas-state'

export const DEFAULT_STATE: ScarabCalcState = {
  remarkableRelics: true,
  blocked: [],
  boosted: [],
  invested: [],
  weightOverrides: {},
  priceOverrides: {},
}

export function loadState(): ScarabCalcState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_STATE }
    const parsed = JSON.parse(raw) as Partial<ScarabCalcState>
    return {
      remarkableRelics: parsed.remarkableRelics ?? true,
      blocked: parsed.blocked ?? [],
      boosted: parsed.boosted ?? [],
      invested: parsed.invested ?? [],
      weightOverrides: parsed.weightOverrides ?? {},
      priceOverrides: parsed.priceOverrides ?? {},
    }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export function saveState(state: ScarabCalcState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
}

export function formatChaos(chaos: number | null | undefined): string {
  if (chaos == null || Number.isNaN(chaos)) return '—'
  if (Math.abs(chaos) >= 100) return `${Math.round(chaos)}c`
  return `${chaos.toFixed(1)}c`
}

export function shortenScarabName(name: string): string {
  return name.replace(/Scarab of /i, '').replace(/ Scarab$/i, '')
}

export function getEffectiveWeight(scarab: ScarabDef, state: ScarabCalcState, applyRemarkable = true): number {
  let weight = state.weightOverrides[scarab.id] !== undefined ? state.weightOverrides[scarab.id] : scarab.weight
  if (applyRemarkable && state.remarkableRelics && weight > 0) {
    weight = Math.pow(weight, 0.9)
  }
  return weight
}

export function getEffectivePrice(scarab: ScarabDef, state: ScarabCalcState, prices: Record<string, number>): number {
  if (state.priceOverrides[scarab.id] !== undefined) return state.priceOverrides[scarab.id]
  return prices[scarab.name] ?? 0
}

export function calculatePoolEV(
  catalog: ScarabCatalog,
  state: ScarabCalcState,
  prices: Record<string, number>,
  opts?: {
    blocks?: string[]
    boosts?: string[]
    investments?: string[]
    applyRemarkable?: boolean
  },
): number {
  const blocks = new Set(opts?.blocks ?? state.blocked)
  const boosts = new Set(opts?.boosts ?? state.boosted)
  const investments = new Set(opts?.investments ?? state.invested)
  const applyRemarkable = opts?.applyRemarkable ?? true

  let totalWeight = 0
  let totalValue = 0
  for (const cat of catalog.categories) {
    if (blocks.has(cat.id)) continue
    let mult = 1
    if (boosts.has(cat.id)) mult *= 2
    if (investments.has(cat.id)) mult *= 1.5
    for (const scarab of cat.scarabs) {
      const w = getEffectiveWeight(scarab, state, applyRemarkable) * mult
      totalWeight += w
      totalValue += w * getEffectivePrice(scarab, state, prices)
    }
  }
  return totalWeight > 0 ? totalValue / totalWeight : 0
}

export function calculateCategoryEV(
  cat: ScarabCategory,
  state: ScarabCalcState,
  prices: Record<string, number>,
): { ev: number; weight: number } {
  let weight = 0
  let value = 0
  for (const scarab of cat.scarabs) {
    const w = getEffectiveWeight(scarab, state)
    weight += w
    value += w * getEffectivePrice(scarab, state, prices)
  }
  return { ev: weight > 0 ? value / weight : 0, weight }
}

export interface OptimalStrategy {
  blocks: string[]
  boosts: string[]
  investments: string[]
  ev: number
  marginals: Record<string, { block?: number; boost?: number; invest?: number }>
}

export function calculateOptimalStrategy(
  catalog: ScarabCatalog,
  state: ScarabCalcState,
  prices: Record<string, number>,
): OptimalStrategy {
  const blockable = catalog.categories.filter((c) => c.atlasModifier === 'blockable')
  const boostable = catalog.categories.filter((c) => c.atlasModifier === 'boostable')
  const investable = catalog.categories.filter((c) => c.investmentBoost)

  const calcEV = (blocks: string[], boosts: string[], investments: string[]): number =>
    calculatePoolEV(catalog, state, prices, { blocks, boosts, investments })

  const categoryEV = (cat: ScarabCategory): number => calculateCategoryEV(cat, state, prices).ev

  // Block categories below unblocked pool EV
  let poolWeight = 0
  let poolValue = 0
  for (const cat of catalog.categories) {
    for (const scarab of cat.scarabs) {
      const w = getEffectiveWeight(scarab, state)
      poolWeight += w
      poolValue += w * getEffectivePrice(scarab, state, prices)
    }
  }
  let currentPoolEV = poolWeight > 0 ? poolValue / poolWeight : 0

  const optimalBlocks: string[] = []
  for (const cat of blockable) {
    if (categoryEV(cat) < currentPoolEV) optimalBlocks.push(cat.id)
  }

  // Recalc pool after blocks
  poolWeight = 0
  poolValue = 0
  for (const cat of catalog.categories) {
    if (optimalBlocks.includes(cat.id)) continue
    for (const scarab of cat.scarabs) {
      const w = getEffectiveWeight(scarab, state)
      poolWeight += w
      poolValue += w * getEffectivePrice(scarab, state, prices)
    }
  }
  currentPoolEV = poolWeight > 0 ? poolValue / poolWeight : 0

  // Greedy boosts (2x)
  const boostCandidates = boostable
    .filter((c) => !optimalBlocks.includes(c.id))
    .map((c) => ({ id: c.id, ev: categoryEV(c) }))
    .sort((a, b) => b.ev - a.ev)

  const optimalBoosts: string[] = []
  for (const candidate of boostCandidates) {
    if (candidate.ev > currentPoolEV) {
      optimalBoosts.push(candidate.id)
      currentPoolEV = calcEV(optimalBlocks, optimalBoosts, [])
    } else break
  }

  // Greedy investments (1.5x)
  const investCandidates = investable
    .filter((c) => !optimalBlocks.includes(c.id))
    .map((c) => ({ id: c.id, ev: categoryEV(c) }))
    .sort((a, b) => b.ev - a.ev)

  const optimalInvestments: string[] = []
  for (const candidate of investCandidates) {
    if (candidate.ev > currentPoolEV) {
      optimalInvestments.push(candidate.id)
      currentPoolEV = calcEV(optimalBlocks, optimalBoosts, optimalInvestments)
    } else break
  }

  const optimalEV = currentPoolEV
  const marginals: OptimalStrategy['marginals'] = {}

  for (const id of optimalBlocks) {
    const without = optimalBlocks.filter((b) => b !== id)
    marginals[id] = { block: optimalEV - calcEV(without, optimalBoosts, optimalInvestments) }
  }
  for (const id of optimalBoosts) {
    const without = optimalBoosts.filter((b) => b !== id)
    if (!marginals[id]) marginals[id] = {}
    marginals[id].boost = optimalEV - calcEV(optimalBlocks, without, optimalInvestments)
  }
  for (const id of optimalInvestments) {
    const without = optimalInvestments.filter((i) => i !== id)
    if (!marginals[id]) marginals[id] = {}
    marginals[id].invest = optimalEV - calcEV(optimalBlocks, optimalBoosts, without)
  }

  // Alternatives for non-selected actions
  for (const cat of blockable) {
    if (optimalBlocks.includes(cat.id)) continue
    if (!marginals[cat.id]) marginals[cat.id] = {}
    const withBlock = [...optimalBlocks, cat.id]
    marginals[cat.id].block = calcEV(withBlock, optimalBoosts, optimalInvestments) - optimalEV
  }
  for (const cat of boostable) {
    if (optimalBoosts.includes(cat.id) || optimalBlocks.includes(cat.id)) continue
    if (!marginals[cat.id]) marginals[cat.id] = {}
    const withBoost = [...optimalBoosts, cat.id]
    marginals[cat.id].boost = calcEV(optimalBlocks, withBoost, optimalInvestments) - optimalEV
  }
  for (const cat of investable) {
    if (optimalInvestments.includes(cat.id) || optimalBlocks.includes(cat.id)) continue
    if (cat.atlasModifier === 'blockable') continue
    if (!marginals[cat.id]) marginals[cat.id] = {}
    const withInvest = [...optimalInvestments, cat.id]
    marginals[cat.id].invest = calcEV(optimalBlocks, optimalBoosts, withInvest) - optimalEV
  }

  return {
    blocks: optimalBlocks,
    boosts: optimalBoosts,
    investments: optimalInvestments,
    ev: optimalEV,
    marginals,
  }
}

export function buildVendorSearchString(
  catalog: ScarabCatalog,
  state: ScarabCalcState,
  prices: Record<string, number>,
): { search: string; included: number; total: number; missingSig: number } {
  const MAX_LENGTH = 248
  const baseline = calculatePoolEV(catalog, state, prices, {
    blocks: [],
    boosts: [],
    investments: [],
    applyRemarkable: false,
  })
  const threshold = baseline / 3

  const vendorable = catalog.categories
    .flatMap((c) => c.scarabs)
    .filter((s) => getEffectivePrice(s, state, prices) < threshold)
    .map((s) => ({
      ...s,
      profit: baseline - getEffectivePrice(s, state, prices) * 3,
    }))
    .sort((a, b) => b.profit - a.profit)

  const withSig = vendorable.filter((s) => s.signature)
  const missingSig = vendorable.length - withSig.length

  const signatures: string[] = []
  let currentLength = 0
  for (const scarab of withSig) {
    const sig = scarab.signature
    const addLength = signatures.length === 0 ? sig.length : sig.length + 1
    if (currentLength + addLength <= MAX_LENGTH) {
      signatures.push(sig)
      currentLength += addLength
    }
  }

  return {
    search: signatures.length ? `"${signatures.join('|')}"` : '(no vendorable scarabs)',
    included: signatures.length,
    total: vendorable.length,
    missingSig,
  }
}

export function toggleInList(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}
