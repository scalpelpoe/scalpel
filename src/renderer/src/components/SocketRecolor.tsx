import { useState, useEffect } from 'react'
import type { PoeItem } from '../../../shared/types'
import { ItemSummary } from './ItemSummary'
import socketRed from '../assets/sockets/socket-red.png'
import socketGreen from '../assets/sockets/socket-green.png'
import socketBlue from '../assets/sockets/socket-blue.png'
import socketWhite from '../assets/sockets/socket-white.png'
import socketLink from '../assets/sockets/socket-link.png'
import itemClassesData from '../../../shared/data/items/item-classes.json'
import { chaosIcon } from '../shared/icons'

const chromIcon =
  'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRDb2xvdXJzIiwic2NhbGUiOjF9XQ/19c8ddae20/CurrencyRerollSocketColours.png'
const jewIcon =
  'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXROdW1iZXJzIiwic2NhbGUiOjF9XQ/ba411ff58a/CurrencyRerollSocketNumbers.png'
const fusIcon =
  'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lSZXJvbGxTb2NrZXRMaW5rcyIsInNjYWxlIjoxfV0/c5e1959880/CurrencyRerollSocketLinks.png'

const SOCKET_IMG: Record<string, string> = { R: socketRed, G: socketGreen, B: socketBlue, W: socketWhite }
const CYCLE: Record<string, string> = { R: 'G', G: 'B', B: 'R', W: 'R' }
const _itemClasses = itemClassesData as Record<string, { bases: string[]; size: [number, number] }>
const classSizes: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(_itemClasses).map(([k, v]) => [k, v.size]),
)
const baseClassMap: Record<string, string> = {}
for (const [cls, { bases }] of Object.entries(_itemClasses)) {
  for (const base of bases) baseClassMap[base] = cls
}

function getDims(baseType: string, itemClass: string): { w: number; h: number } | undefined {
  const cs = classSizes[itemClass]
  if (cs) return { w: cs[0], h: cs[1] }
  const cls = baseClassMap[baseType]
  if (cls) {
    const s = classSizes[cls]
    if (s) return { w: s[0], h: s[1] }
  }
  return undefined
}

// Bench costs in jewellers to craft N sockets
const JEWELLER_BENCH = [0, 1, 1, 3, 10, 70, 350]

// --- Vorici coloring math ---

function getColorChances(str: number, dex: number, int: number): { r: number; g: number; b: number } {
  const reqs = [str, dex, int]
  const total = str + dex + int
  const nonZero = reqs.filter((r) => r > 0).length
  const MAX = 0.9,
    X = 5,
    C = 5

  if (nonZero === 1) {
    const f = (i: number) =>
      reqs[i] > 0 ? (MAX * (X + C + reqs[i])) / (total + 3 * X + C) : (1 - MAX) / 2 + MAX * (X / (total + 3 * X + C))
    return { r: f(0), g: f(1), b: f(2) }
  }
  if (nonZero === 2) {
    const f = (i: number) => (reqs[i] > 0 ? (MAX * reqs[i]) / total : 1 - MAX)
    return { r: f(0), g: f(1), b: f(2) }
  }
  return { r: str / total, g: dex / total, b: int / total }
}

function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function multinomial(
  ch: { r: number; g: number; b: number },
  d: { r: number; g: number; b: number },
  free: number,
  pos = 1,
): number {
  if (free > 0) {
    return (
      (pos <= 1 ? multinomial(ch, { ...d, r: d.r + 1 }, free - 1, 1) : 0) +
      (pos <= 2 ? multinomial(ch, { ...d, g: d.g + 1 }, free - 1, 2) : 0) +
      multinomial(ch, { ...d, b: d.b + 1 }, free - 1, 3)
    )
  }
  const t = d.r + d.g + d.b
  return (
    (factorial(t) / (factorial(d.r) * factorial(d.g) * factorial(d.b))) *
    Math.pow(ch.r, d.r) *
    Math.pow(ch.g, d.g) *
    Math.pow(ch.b, d.b)
  )
}

// --- Currency prices ---

interface CurrencyRates {
  chrom: number // chaos per chromatic
  jeweller: number // chaos per jeweller
  fusing: number // chaos per fusing
}

// --- Calculation ---

interface CraftResult {
  method: string
  avgChaos: number
  chance: number
  note?: string
  debugChroms?: number
  debugJewellers?: number
  debugFusings?: number
}

const BENCH_RECIPES: { r: number; g: number; b: number; cost: number; label: string }[] = [
  { r: 1, g: 0, b: 0, cost: 4, label: '1R' },
  { r: 0, g: 1, b: 0, cost: 4, label: '1G' },
  { r: 0, g: 0, b: 1, cost: 4, label: '1B' },
  { r: 2, g: 0, b: 0, cost: 25, label: '2R' },
  { r: 0, g: 2, b: 0, cost: 25, label: '2G' },
  { r: 0, g: 0, b: 2, cost: 25, label: '2B' },
  { r: 1, g: 1, b: 0, cost: 15, label: '1R1G' },
  { r: 1, g: 0, b: 1, cost: 15, label: '1R1B' },
  { r: 0, g: 1, b: 1, cost: 15, label: '1G1B' },
  { r: 3, g: 0, b: 0, cost: 120, label: '3R' },
  { r: 0, g: 3, b: 0, cost: 120, label: '3G' },
  { r: 0, g: 0, b: 3, cost: 120, label: '3B' },
  { r: 2, g: 1, b: 0, cost: 100, label: '2R1G' },
  { r: 2, g: 0, b: 1, cost: 100, label: '2R1B' },
  { r: 1, g: 2, b: 0, cost: 100, label: '1R2G' },
  { r: 0, g: 2, b: 1, cost: 100, label: '2G1B' },
  { r: 1, g: 0, b: 2, cost: 100, label: '1R2B' },
  { r: 0, g: 1, b: 2, cost: 100, label: '1G2B' },
]

function calculateMethods(
  str: number,
  dex: number,
  int: number,
  totalSockets: number,
  wantR: number,
  wantG: number,
  wantB: number,
  rates: CurrencyRates,
  isLinked6: boolean,
): CraftResult[] {
  if (totalSockets <= 0 || wantR + wantG + wantB > totalSockets) return []
  if (str === 0 && dex === 0 && int === 0) return []

  const chances = getColorChances(str, dex, int)
  const results: CraftResult[] = []
  const free = totalSockets - wantR - wantG - wantB

  // Chromatic spam
  const chromChance = multinomial(chances, { r: wantR, g: wantG, b: wantB }, free)
  if (chromChance > 0) {
    const avgChroms = 1 / chromChance
    results.push({
      method: 'Chromatic spam',
      avgChaos: avgChroms * rates.chrom,
      chance: chromChance,
      debugChroms: Math.round(avgChroms),
    })
  }

  // Bench recipes (applied at full socket count)
  for (const recipe of BENCH_RECIPES) {
    if (recipe.r > wantR || recipe.g > wantG || recipe.b > wantB) continue
    const remaining = { r: wantR - recipe.r, g: wantG - recipe.g, b: wantB - recipe.b }
    const chance = multinomial(chances, remaining, free)
    if (chance > 0) {
      const avgChroms = recipe.cost / chance
      results.push({
        method: `Bench ${recipe.label}`,
        avgChaos: avgChroms * rates.chrom,
        chance,
        debugChroms: Math.round(avgChroms),
      })
    }
  }

  // Jeweller's trick: reduce to N sockets, force colors with bench, add back
  // For each bench recipe where recipeCount < totalSockets
  for (const recipe of BENCH_RECIPES) {
    const recipeCount = recipe.r + recipe.g + recipe.b
    if (recipeCount >= totalSockets) continue // No point if already at max
    if (recipe.r > wantR || recipe.g > wantG || recipe.b > wantB) continue

    const remaining = { r: wantR - recipe.r, g: wantG - recipe.g, b: wantB - recipe.b }
    const remainingTotal = remaining.r + remaining.g + remaining.b
    const remainingFree = totalSockets - recipeCount - remainingTotal

    // Chance that added-back sockets roll the remaining desired colors
    const chance = remainingTotal + remainingFree > 0 ? multinomial(chances, remaining, remainingFree) : 1

    if (chance <= 0) continue

    // Jeweller cost to go from recipeCount back to totalSockets (one attempt)
    const jewAddCost = JEWELLER_BENCH.slice(recipeCount + 1, totalSockets + 1).reduce((a, b) => a + b, 0)
    // On failure: remove back to recipeCount then re-add (2x jeweller cost)
    const jewRetryCost = 2 * jewAddCost

    // One-time: bench recipe (chroms) + reduce to recipeCount (trivial, 1 jeweller)
    const setupChaos = recipe.cost * rates.chrom + 1 * rates.jeweller
    // Per-try: jeweller add cost (first try) + retries
    const avgJewChaos =
      chance >= 1
        ? jewAddCost * rates.jeweller
        : jewAddCost * rates.jeweller + (1 / chance - 1) * jewRetryCost * rates.jeweller

    const totalJewellers = Math.round((1 * rates.jeweller + avgJewChaos) / rates.jeweller)
    let totalChaos = setupChaos + avgJewChaos
    let note: string | undefined
    let debugFusings = 0

    // 6-socket linked items need relinking after jeweller trick
    if (isLinked6 && totalSockets === 6) {
      const relinkCost = 1500 * rates.fusing
      totalChaos += relinkCost
      note = 'includes relinking'
      debugFusings = 1500
    }

    results.push({
      method: `Jeweller ${recipe.label}`,
      avgChaos: totalChaos,
      chance,
      note,
      debugChroms: recipe.cost,
      debugJewellers: totalJewellers,
      debugFusings: debugFusings || undefined,
    })
  }

  results.sort((a, b) => a.avgChaos - b.avgChaos)
  return results
}

// --- Component ---

interface Props {
  item: PoeItem
  priceInfo?: import('../../../shared/types').PriceInfo
}

function getMaxSockets(item: PoeItem): number {
  const dims = getDims(item.baseType, item.itemClass)
  if (dims) return Math.min(dims.w * dims.h, 6)
  const current = item.sockets.replace(/[^RGBWAD]/g, '').length
  return current || 6
}

export function SocketRecolor({ item, priceInfo }: Props): JSX.Element {
  const maxSockets = getMaxSockets(item)
  const [rates, setRates] = useState<CurrencyRates>({ chrom: 1 / 8, jeweller: 1 / 6, fusing: 1 / 2 })

  // Fetch currency prices
  useEffect(() => {
    ;(async () => {
      try {
        const settings = await window.api.getSettings()
        const prices = await window.api.batchLookupPrices(
          ['Chromatic Orb', "Jeweller's Orb", 'Orb of Fusing'],
          settings.league,
        )
        setRates({
          chrom: prices['Chromatic Orb']?.chaosValue ?? 1 / 8,
          jeweller: prices["Jeweller's Orb"]?.chaosValue ?? 1 / 6,
          fusing: prices['Orb of Fusing']?.chaosValue ?? 1 / 2,
        })
      } catch {
        /* use defaults */
      }
    })()
  }, [])

  // Parse socket string into flat colors + link map
  const groups = item.sockets.split(' ').filter(Boolean)
  const parsedColors: string[] = []
  const linkedAfter = new Set<number>()
  for (const group of groups) {
    const socks = group.split('-')
    for (let i = 0; i < socks.length; i++) {
      if (i < socks.length - 1) linkedAfter.add(parsedColors.length)
      parsedColors.push(socks[i] === 'A' || socks[i] === 'D' ? 'W' : socks[i])
    }
  }
  while (parsedColors.length < maxSockets) parsedColors.push('W')

  const isLinked6 = item.linkedSockets >= 6

  const [colors, setColors] = useState<string[]>(parsedColors.slice(0, maxSockets))
  const [costModes, setCostModes] = useState<Record<number, number>>({}) // per-row cost display mode

  const cycleSocket = (i: number) => {
    setColors((prev) => {
      const next = [...prev]
      next[i] = CYCLE[next[i]] ?? 'R'
      return next
    })
  }

  const wantR = colors.filter((c) => c === 'R').length
  const wantG = colors.filter((c) => c === 'G').length
  const wantB = colors.filter((c) => c === 'B').length
  const hasReqs = item.reqStr > 0 || item.reqDex > 0 || item.reqInt > 0

  const results = hasReqs
    ? calculateMethods(item.reqStr, item.reqDex, item.reqInt, maxSockets, wantR, wantG, wantB, rates, isLinked6)
    : []

  const best = results[0]
  const SOCK = 34
  const LINK_W = 14
  const LINK_OV = 2

  function formatChaos(v: number): string {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
    if (v >= 10) return String(Math.round(v))
    if (v >= 1) return v.toFixed(1)
    return v.toFixed(2)
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <ItemSummary item={item} priceInfo={priceInfo} hideSockets />

      {/* Socket picker + results */}
      <div className="flex flex-col flex-1 min-h-0 rounded-t-lg overflow-hidden">
        <div className="bg-bg-card p-3 flex flex-col items-center gap-2">
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-black/25 px-[14px] pt-2 pb-1.5">
            <div className="flex items-center justify-center">
              {colors.map((c, i) => {
                const hasLink = linkedAfter.has(i)
                return (
                  <div key={i} className="contents">
                    {i > 0 && !linkedAfter.has(i - 1) && <div className="w-2" />}
                    <img
                      src={SOCKET_IMG[c] ?? socketWhite}
                      alt={c}
                      onClick={() => cycleSocket(i)}
                      className="cursor-pointer transition-transform duration-100 relative z-[2] hover:scale-[1.15]"
                      style={{
                        width: SOCK,
                        height: SOCK,
                      }}
                    />
                    {hasLink && (
                      <img
                        src={socketLink}
                        alt="-"
                        className="relative z-[1] object-contain"
                        style={{
                          width: LINK_W,
                          height: SOCK,
                          marginLeft: -LINK_OV,
                          marginRight: -LINK_OV,
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
            <span className="text-[9px] text-text-dim">Click to recolor sockets</span>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto bg-bg-solid">
          {!hasReqs && (
            <div className="p-3 text-[11px] text-text-dim text-center">
              No stat requirements to calculate probabilities
            </div>
          )}

          {results.length > 0 && (
            <div className="flex flex-col">
              {results.slice(0, 10).map((r, i) => {
                const isBest = r === best
                return (
                  <div
                    key={`${r.method}-${i}`}
                    className="flex items-center gap-2"
                    style={{
                      padding: '6px 12px',
                      background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                      borderLeft: isBest ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    <span
                      className="text-[11px] flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{
                        fontWeight: isBest ? 700 : 400,
                        color: isBest ? 'var(--accent)' : 'var(--text)',
                      }}
                    >
                      {r.method}
                      {isBest ? ' (Best Option)' : ''}
                      {r.note && <span className="text-[9px] text-text-dim ml-1">({r.note})</span>}
                    </span>

                    {/* Recipe socket icons */}
                    {r.debugChroms != null &&
                      r.method !== 'Chromatic spam' &&
                      (() => {
                        const label = r.method.replace(/^(Bench|Jeweller) /, '')
                        const socks: string[] = []
                        const m = label.matchAll(/(\d)([RGB])/g)
                        for (const [, count, color] of m) {
                          for (let j = 0; j < parseInt(count); j++) socks.push(color)
                        }
                        if (socks.length === 0) return null
                        return (
                          <span className="inline-flex items-center gap-px rounded-full shrink-0 bg-white/[0.06] px-1 py-[2px]">
                            {socks.map((s, si) => (
                              <img key={si} src={SOCKET_IMG[s] ?? socketWhite} alt={s} className="w-3 h-3" />
                            ))}
                          </span>
                        )
                      })()}

                    <span className="inline-flex items-center gap-[3px] rounded shrink-0 whitespace-nowrap text-[10px] bg-white/[0.06] px-1.5 py-[2px] min-w-[54px] justify-end">
                      <span className="text-text-dim">
                        Tries: <span className="font-bold text-white">{Math.round(1 / r.chance).toLocaleString()}</span>
                      </span>
                    </span>

                    {(() => {
                      const views: { value: string; icon: string }[] = [
                        { value: `~${formatChaos(r.avgChaos)}`, icon: chaosIcon },
                      ]
                      if (r.debugChroms) views.push({ value: `~${r.debugChroms.toLocaleString()}`, icon: chromIcon })
                      if (r.debugJewellers)
                        views.push({ value: `~${r.debugJewellers.toLocaleString()}`, icon: jewIcon })
                      if (r.debugFusings) views.push({ value: `~${r.debugFusings.toLocaleString()}`, icon: fusIcon })
                      const mode = costModes[i] ?? 0
                      const view = views[mode % views.length]
                      return (
                        <span
                          onClick={() => setCostModes((prev) => ({ ...prev, [i]: (prev[i] ?? 0) + 1 }))}
                          className="inline-flex items-center gap-[3px] rounded shrink-0 whitespace-nowrap text-[10px] bg-white/[0.06] px-1.5 py-[2px] min-w-[52px] justify-end"
                          style={{
                            cursor: views.length > 1 ? 'pointer' : 'default',
                          }}
                          title={views.length > 1 ? 'Click to cycle currency' : undefined}
                        >
                          <span className="text-white font-semibold">{view.value}</span>
                          <img src={view.icon} alt="" className="w-3 h-3" />
                        </span>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
