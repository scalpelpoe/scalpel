import { useState, useEffect } from 'react'
import type { PoeItem } from '@shared/types'
import { ItemSummary } from '../../components/ItemSummary'
import { zebraRowBg } from '../../shared/utils'
import socketRed from '../../assets/sockets/socket-red.png'
import socketGreen from '../../assets/sockets/socket-green.png'
import socketBlue from '../../assets/sockets/socket-blue.png'
import socketWhite from '../../assets/sockets/socket-white.png'
import socketLink from '../../assets/sockets/socket-link.png'
import { getItemClasses } from '@shared/data/items/item-classes'
import { chaosIcon } from '../../shared/icons'
import {
  calculateMethods,
  recolorNotice,
  socketChances,
  DEFAULT_RATES,
  type ChanceInput,
  type CraftResult,
  type Rates,
} from './chromatic-math'
import { parseSocketString } from './parse-sockets'
// Socket recolor is a PoE1-only feature (gated via features.socketRecolor), so we
// pull its icons directly from the PoE1 sheet rather than going through the shared
// iconMap -- these are module-load-time constants evaluated before initIconMap runs.
import itemIcons from '@shared/data/items/item-icons-poe1.json'

// Flatten the PoE1 per-class basetype lists into a name -> reqs lookup.
// SocketRecolor is gated on features.socketRecolor (PoE1-only), so we pin the
// PoE1 sheet explicitly via getItemClasses(1) -- module-load-time means we
// can't read the live poeVersion yet.
const BASE_ITEM_REQS: Record<string, [number, number, number]> = {}
for (const { bases } of Object.values(getItemClasses(1))) {
  for (const b of bases) {
    if (b.reqs) BASE_ITEM_REQS[b.name] = b.reqs
  }
}

const icons = itemIcons as Record<string, string>
const chromIcon = icons['Chromatic Orb']
const omenIcon = icons['Omen of Trichromatism']

const SOCKET_IMG: Record<string, string> = { R: socketRed, G: socketGreen, B: socketBlue, W: socketWhite }
// White is a legitimate target now that most sockets roll white, so it is in the cycle.
const CYCLE: Record<string, string> = { R: 'G', G: 'B', B: 'W', W: 'R' }

const CHANCE_ROW: { key: 'r' | 'g' | 'b' | 'w'; img: string }[] = [
  { key: 'r', img: socketRed },
  { key: 'g', img: socketGreen },
  { key: 'b', img: socketBlue },
  { key: 'w', img: socketWhite },
]

const NOTICE_TEXT = {
  'no-requirements': 'No stat requirements to calculate probabilities',
  'no-item-level': "Item level unknown, can't calculate socket color odds",
  'no-colors': 'Pick at least one colored socket',
} as const

interface Props {
  item: PoeItem
  priceInfo?: import('@shared/types').PriceInfo
  chaosPerDivine?: number
  divineGraph?: (number | null)[]
}

function formatAmount(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`
  if (v >= 10) return String(Math.round(v))
  if (v >= 1) return v.toFixed(1)
  return v.toFixed(2)
}

export function SocketRecolor({ item, priceInfo, chaosPerDivine, divineGraph }: Props): JSX.Element {
  const [rates, setRates] = useState<Rates>(DEFAULT_RATES)
  const [omenPriceResolved, setOmenPriceResolved] = useState(false)

  // Fetch currency prices
  useEffect(() => {
    ;(async () => {
      try {
        const settings = await window.api.getSettings()
        const prices = await window.api.batchLookupPrices(
          ['Chromatic Orb', 'Omen of Trichromatism'],
          settings.activeProfile?.league ?? '',
        )
        setRates({
          chromChaos: prices['Chromatic Orb']?.chaosValue ?? DEFAULT_RATES.chromChaos,
          omenChaos: prices['Omen of Trichromatism']?.chaosValue ?? DEFAULT_RATES.omenChaos,
        })
        setOmenPriceResolved(prices['Omen of Trichromatism']?.chaosValue != null)
      } catch {
        /* use defaults */
      }
    })()
  }, [])

  // Parse socket string into flat colors + link map. Abyssal/resonator sockets are
  // not recolourable, so they are dropped rather than folded into white.
  const { colors: parsedColors, linkedAfter: linkedAfterList } = parseSocketString(item.sockets)
  const linkedAfter = new Set(linkedAfterList)
  const [colors, setColors] = useState<string[]>(parsedColors)
  const [costModes, setCostModes] = useState<Record<string, number>>({}) // per-recipe cost display mode

  const cycleSocket = (i: number) => {
    setColors((prev) => {
      const next = [...prev]
      next[i] = CYCLE[next[i]] ?? 'R'
      return next
    })
  }

  // Use the base item's pristine attribute requirements when we know the base.
  // The clipboard's reqStr/Dex/Int includes contributions from socketed gems
  // (e.g. a high-level Awakened gem inflates Int), and the color math wants the
  // base's intrinsic weights.
  const [reqStr, reqDex, reqInt] = BASE_ITEM_REQS[item.baseType] ?? [item.reqStr, item.reqDex, item.reqInt]

  const input: ChanceInput = {
    reqStr,
    reqDex,
    reqInt,
    itemLevel: item.itemLevel,
    quality: item.quality,
    totalSockets: colors.length,
    wantR: colors.filter((c) => c === 'R').length,
    wantG: colors.filter((c) => c === 'G').length,
    wantB: colors.filter((c) => c === 'B').length,
  }

  const notice = recolorNotice(input)
  const results: CraftResult[] = notice ? [] : calculateMethods(input, rates)
  const chances = socketChances(input)
  const best = results.find((r) => r.avgChaos != null)

  const SOCK = 34
  const LINK_W = 14
  const LINK_OV = 2

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      <ItemSummary
        item={{ ...item, reqStr, reqDex, reqInt }}
        priceInfo={priceInfo}
        chaosPerDivine={chaosPerDivine}
        divineGraph={divineGraph}
        hideSockets
      />

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
            <span className="text-[9px] text-text-dim">Click to recolor sockets, white means any</span>
          </div>

          {/* Per-socket odds for this item. White dominates unless the item is high
              level and well qualitied, so this is the headline number now. */}
          {notice !== 'no-requirements' && notice !== 'no-item-level' && (
            <div className="flex items-center gap-2.5">
              {CHANCE_ROW.map(({ key, img }) => (
                <span key={key} className="inline-flex items-center gap-1 text-[9px] text-text-dim">
                  <img src={img} alt={key.toUpperCase()} className="w-2.5 h-2.5" />
                  {(chances[key] * 100).toFixed(2)}%
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto bg-bg-solid">
          {notice && <div className="p-3 text-[11px] text-text-dim text-center">{NOTICE_TEXT[notice]}</div>}

          {results.length > 0 && (
            <div className="flex flex-col">
              {results.map((r, i) => {
                const isBest = r === best
                const swatch = [
                  ...Array<string>(r.forced.r).fill('R'),
                  ...Array<string>(r.forced.g).fill('G'),
                  ...Array<string>(r.forced.b).fill('B'),
                ]
                const views: { value: string; icon: string }[] = []
                if (r.avgChaos != null) views.push({ value: `~${formatAmount(r.avgChaos)}`, icon: chaosIcon })
                if (r.chroms != null) views.push({ value: `~${formatAmount(r.chroms)}`, icon: chromIcon })
                if (r.omens != null) views.push({ value: `~${formatAmount(r.omens)}`, icon: omenIcon })
                const view = views[(costModes[r.key] ?? 0) % (views.length || 1)]

                return (
                  <div
                    key={r.key}
                    className="flex items-center gap-2"
                    style={{
                      padding: '6px 12px',
                      background: zebraRowBg(i, 'rgba(255,255,255,0.03)'),
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
                      {r.label}
                      {isBest ? ' (Best Option)' : ''}
                    </span>

                    {swatch.length > 0 && (
                      <span className="inline-flex items-center gap-px rounded-full shrink-0 bg-white/[0.06] px-1 py-[2px]">
                        {swatch.map((s, si) => (
                          <img key={si} src={SOCKET_IMG[s] ?? socketWhite} alt={s} className="w-3 h-3" />
                        ))}
                      </span>
                    )}

                    <span className="inline-flex items-center gap-[3px] rounded shrink-0 whitespace-nowrap text-[10px] bg-white/[0.06] px-1.5 py-[2px] min-w-[54px] justify-end">
                      <span className="text-text-dim">
                        Tries:{' '}
                        <span className="font-bold text-white">
                          {r.chance > 0 ? Math.round(1 / r.chance).toLocaleString() : '-'}
                        </span>
                      </span>
                    </span>

                    {view && (
                      <span
                        onClick={() => setCostModes((prev) => ({ ...prev, [r.key]: (prev[r.key] ?? 0) + 1 }))}
                        className="inline-flex items-center gap-[3px] rounded shrink-0 whitespace-nowrap text-[10px] bg-white/[0.06] px-1.5 py-[2px] min-w-[52px] justify-end"
                        style={{
                          cursor: views.length > 1 ? 'pointer' : 'default',
                        }}
                        title={
                          r.key === 'trichrome' && !omenPriceResolved
                            ? 'Omen price unavailable, cost is an estimate'
                            : views.length > 1
                              ? 'Click to cycle currency'
                              : undefined
                        }
                      >
                        <span className="text-white font-semibold">{view.value}</span>
                        <img src={view.icon} alt="" className="w-3 h-3" />
                      </span>
                    )}
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
