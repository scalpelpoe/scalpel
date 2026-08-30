import { useCallback, useEffect, useMemo, useState } from 'react'
import itemIcons from '@shared/data/items/item-icons-poe1.json'
import { Button } from '../../components/primitives/Button'
import { Toggle } from '../../components/Toggle'
import { IconGlow } from '../../shared/IconGlow'
import { zebraRowBg } from '../../shared/utils'
import catalogJson from './scarab-catalog.json'
import type { ScarabCategory } from './types'
import {
  buildVendorSearchString,
  calculateCategoryEV,
  calculateOptimalStrategy,
  calculatePoolEV,
  formatChaos,
  getEffectivePrice,
  getEffectiveWeight,
  loadState,
  saveState,
  shortenScarabName,
  toggleInList,
} from './calc'
import {
  ADVANCED_DELTAS_KEY,
  EV_LABELS,
  GUIDE_DISMISS_KEY,
  HOW_TO_STEPS,
  TAB_BLURBS,
  atlasModifierLabel,
  loadBool,
  saveBool,
} from './guidance'
import type { ScarabCalcState, ScarabCatalog, TabId } from './types'

const catalog = catalogJson as ScarabCatalog
const SCARAB_ICONS = itemIcons as Record<string, string>

function scarabIconUrl(name: string): string | null {
  return SCARAB_ICONS[name] ?? null
}

/** Prefer the plain "{Category} Scarab" art, else first scarab with an icon. */
function categoryIconUrl(cat: ScarabCategory): string | null {
  const plain = `${cat.name} Scarab`
  if (SCARAB_ICONS[plain]) return SCARAB_ICONS[plain]
  for (const s of cat.scarabs) {
    const url = scarabIconUrl(s.name)
    if (url) return url
  }
  return null
}

function ScarabIcon({ name, url, size = 20 }: { name?: string; url?: string | null; size?: number }): JSX.Element {
  const src = url !== undefined ? url : name ? scarabIconUrl(name) : null
  if (!src) {
    return (
      <div
        className="shrink-0 rounded bg-white/[0.04] border border-white/[0.06]"
        style={{ width: size, height: size }}
        aria-hidden
      />
    )
  }
  return <IconGlow src={src} size={size} blur={8} saturate={2.2} opacity={0.35} />
}

function tabClass(active: boolean): string {
  return [
    'px-3 py-1.5 text-xs rounded border transition-colors',
    active
      ? 'border-white/20 bg-white/10 font-semibold text-text'
      : 'border-white/10 bg-black/20 text-text-dim hover:text-text',
  ].join(' ')
}

function HowToGuide({ onDismiss }: { onDismiss: () => void }): JSX.Element {
  return (
    <div className="rounded border border-accent/40 bg-accent/10 px-2.5 py-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-accent">How to use Scarab Atlas</div>
          <p className="text-[10px] text-text-dim mt-0.5 mb-0 leading-relaxed">
            Goal: raise the average chaos value of scarabs that drop from maps by shaping your atlas tree.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Got it
        </Button>
      </div>
      <ol className="m-0 pl-4 space-y-1.5">
        {HOW_TO_STEPS.map((step, i) => (
          <li key={step.title} className="text-[10px] text-text-dim leading-relaxed">
            <span className="text-text font-medium">
              {i + 1}. {step.title}
            </span>
            <span className="text-text-dim"> — {step.body}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function GlossaryPanel(): JSX.Element {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-2.5 py-2 text-[10px] text-text-dim leading-relaxed space-y-1">
      <div className="text-[11px] font-medium text-text mb-1">Quick glossary</div>
      <p className="m-0">
        <span className="text-text">EV</span> — expected chaos value of one random scarab from the drop pool.
      </p>
      <p className="m-0">
        <span className="text-text">Block</span> — remove that category from map drops (atlas block notable).
      </p>
      <p className="m-0">
        <span className="text-text">Boost</span> — 2× drop weight for that category (“more X scarabs”).
      </p>
      <p className="m-0">
        <span className="text-text">Invest</span> — 1.5× drop weight (investment tree). Stacks with Boost → 3×.
      </p>
      <p className="m-0">
        <span className="text-text">Remarkable Relics</span> — atlas keystone model that flattens weights (weight^0.9).
        Leave on if you take that keystone.
      </p>
    </div>
  )
}

function RecommendedChecklist({
  catalogCats,
  optimal,
  onApply,
  loading,
}: {
  catalogCats: ScarabCategory[]
  optimal: ReturnType<typeof calculateOptimalStrategy>
  onApply: () => void
  loading: boolean
}): JSX.Element {
  const nameOf = (id: string) => catalogCats.find((c) => c.id === id)?.name ?? id
  const hasRecs = optimal.blocks.length + optimal.boosts.length + optimal.investments.length > 0

  return (
    <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-emerald-300">Recommended atlas setup</div>
        <Button size="sm" variant="primary" onClick={onApply} disabled={loading}>
          Apply to list
        </Button>
      </div>
      <p className="text-[10px] text-text-dim m-0 leading-relaxed">
        Mirror these on your atlas tree. “Apply to list” only updates the buttons below — it does not change Path of
        Exile for you.
      </p>
      {!hasRecs ? (
        <p className="text-[10px] text-text-dim m-0">No blocks/boosts/invests beat the current pool.</p>
      ) : (
        <div className="grid grid-cols-1 gap-1 text-[10px]">
          {optimal.blocks.length > 0 && (
            <div>
              <span className="text-red-300 font-medium">Block: </span>
              <span className="text-text">{optimal.blocks.map(nameOf).join(', ')}</span>
            </div>
          )}
          {optimal.boosts.length > 0 && (
            <div>
              <span className="text-accent font-medium">Boost ×2: </span>
              <span className="text-text">{optimal.boosts.map(nameOf).join(', ')}</span>
            </div>
          )}
          {optimal.investments.length > 0 && (
            <div>
              <span className="text-sky-300 font-medium">Invest ×1.5: </span>
              <span className="text-text">{optimal.investments.map(nameOf).join(', ')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ScarabAtlas(): JSX.Element {
  const [tab, setTab] = useState<TabId>('calculator')
  const [state, setState] = useState<ScarabCalcState>(() => loadState())
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [league, setLeague] = useState('')
  const [loading, setLoading] = useState(true)
  const [vendorSearch, setVendorSearch] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [guideOpen, setGuideOpen] = useState(() => !loadBool(GUIDE_DISMISS_KEY, false))
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const [showDeltas, setShowDeltas] = useState(() => loadBool(ADVANCED_DELTAS_KEY, false))

  const updateState = useCallback((patch: Partial<ScarabCalcState> | ((prev: ScarabCalcState) => ScarabCalcState)) => {
    setState((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      saveState(next)
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchPrices = async (attempt = 0): Promise<void> => {
      try {
        const settings = await window.api.getSettings()
        const activeLeague = settings.activeProfile?.league ?? ''
        if (!cancelled) setLeague(activeLeague)
        const names = catalog.categories.flatMap((c) => c.scarabs.map((s) => s.name))
        const result: Record<string, number> = {}
        const chunkSize = 200
        for (let i = 0; i < names.length; i += chunkSize) {
          const chunk = names.slice(i, i + chunkSize)
          const p = await window.api.batchLookupPrices(chunk, activeLeague)
          for (const [name, info] of Object.entries(p)) {
            if (info?.chaosValue) result[name] = info.chaosValue
          }
        }
        if (cancelled) return
        if (Object.keys(result).length === 0 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000))
          if (!cancelled) return fetchPrices(attempt + 1)
          return
        }
        setPrices(result)
      } catch {
        if (!cancelled && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000))
          if (!cancelled) return fetchPrices(attempt + 1)
          return
        }
      }
      if (!cancelled) setLoading(false)
    }
    void fetchPrices()
    return () => {
      cancelled = true
    }
  }, [])

  const baselineEV = useMemo(
    () =>
      calculatePoolEV(catalog, state, prices, {
        blocks: [],
        boosts: [],
        investments: [],
      }),
    [state, prices],
  )
  const currentEV = useMemo(() => calculatePoolEV(catalog, state, prices), [state, prices])
  const optimal = useMemo(() => calculateOptimalStrategy(catalog, state, prices), [state, prices])

  const sortedCategories = useMemo(() => {
    return [...catalog.categories]
      .map((cat) => ({ cat, ...calculateCategoryEV(cat, state, prices) }))
      .sort((a, b) => b.ev - a.ev)
  }, [state, prices])

  const applyOptimize = (): void => {
    updateState({
      blocked: optimal.blocks,
      boosted: optimal.boosts,
      invested: optimal.investments,
    })
  }

  const resetBiases = (): void => {
    updateState({ blocked: [], boosted: [], invested: [] })
  }

  const generateVendor = (): void => {
    const result = buildVendorSearchString(catalog, state, prices)
    setVendorSearch(result.search)
  }

  const copyVendor = async (): Promise<void> => {
    if (!vendorSearch || vendorSearch.startsWith('(')) return
    try {
      await navigator.clipboard.writeText(vendorSearch)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const dismissGuide = (): void => {
    setGuideOpen(false)
    saveBool(GUIDE_DISMISS_KEY, true)
  }

  const openGuide = (): void => {
    setGuideOpen(true)
    saveBool(GUIDE_DISMISS_KEY, false)
  }

  const toggleDeltas = (checked: boolean): void => {
    setShowDeltas(checked)
    saveBool(ADVANCED_DELTAS_KEY, checked)
  }

  const pricedCount = Object.keys(prices).length
  const totalScarabs = catalog.categories.reduce((n, c) => n + c.scarabs.length, 0)
  const setupMatchesOptimal =
    state.blocked.length === optimal.blocks.length &&
    state.boosted.length === optimal.boosts.length &&
    state.invested.length === optimal.investments.length &&
    optimal.blocks.every((id) => state.blocked.includes(id)) &&
    optimal.boosts.every((id) => state.boosted.includes(id)) &&
    optimal.investments.every((id) => state.invested.includes(id))

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="bg-bg-card px-3 py-[10px] border-b border-border shrink-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="section-title">Scarab Atlas</span>
              <Button size="sm" variant="ghost" onClick={guideOpen ? dismissGuide : openGuide}>
                {guideOpen ? 'Hide guide' : 'How to use'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setGlossaryOpen((v) => !v)}>
                {glossaryOpen ? 'Hide glossary' : 'Glossary'}
              </Button>
            </div>
            <p className="text-[11px] text-text-dim mt-1 mb-0 leading-relaxed">{TAB_BLURBS[tab]}</p>
            <p className="text-[10px] text-text-dim mt-0.5 mb-0">
              Prices: {league || 'your Scalpel league'} · {pricedCount}/{totalScarabs} priced
              {loading ? ' · loading…' : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-text-dim" title="Leave on if you allocated Remarkable Relics">
                Remarkable Relics
              </span>
              <Toggle
                checked={state.remarkableRelics}
                onChange={(checked) => updateState({ remarkableRelics: checked })}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={tabClass(tab === 'calculator')} onClick={() => setTab('calculator')}>
            Atlas planner
          </button>
          <button type="button" className={tabClass(tab === 'vendor')} onClick={() => setTab('vendor')}>
            Vendor junk
          </button>
          <button type="button" className={tabClass(tab === 'weights')} onClick={() => setTab('weights')}>
            Weights & prices
          </button>
        </div>

        {tab === 'calculator' && (
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 text-[11px]">
            <span title={EV_LABELS.baseline.hint}>
              <span className="text-text-dim block text-[9px] uppercase tracking-wide">{EV_LABELS.baseline.label}</span>
              <span className="text-text font-medium">{loading ? '…' : formatChaos(baselineEV)}</span>
            </span>
            <span title={EV_LABELS.current.hint}>
              <span className="text-text-dim block text-[9px] uppercase tracking-wide">{EV_LABELS.current.label}</span>
              <span className="text-accent font-semibold">{loading ? '…' : formatChaos(currentEV)}</span>
            </span>
            <span title={EV_LABELS.optimal.hint}>
              <span className="text-text-dim block text-[9px] uppercase tracking-wide">{EV_LABELS.optimal.label}</span>
              <span className="text-emerald-400 font-medium">{loading ? '…' : formatChaos(optimal.ev)}</span>
            </span>
            {!loading && !setupMatchesOptimal && (
              <span className="text-[10px] text-amber-300/90 self-center">Your setup ≠ recommended</span>
            )}
            <div className="flex gap-1.5 ml-auto">
              <Button size="sm" variant="ghost" onClick={resetBiases} title="Clear all Block / Boost / Invest">
                Reset setup
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={applyOptimize}
                disabled={loading}
                title="Apply the recommended Block / Boost / Invest to the list below"
              >
                Optimize
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto bg-bg-solid min-h-0">
        <div className="p-2 space-y-2">
          {guideOpen && <HowToGuide onDismiss={dismissGuide} />}
          {glossaryOpen && <GlossaryPanel />}

          {tab === 'calculator' && (
            <>
              <RecommendedChecklist
                catalogCats={catalog.categories}
                optimal={optimal}
                onApply={applyOptimize}
                loading={loading}
              />
              <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-[10px] text-text-dim m-0 leading-relaxed">
                  Categories sorted by value. Yellow “Recommended” badges match Optimize. Toggle actions, then take the
                  same notables on your atlas.
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] text-text-dim whitespace-nowrap">Advanced ΔEV</span>
                  <Toggle checked={showDeltas} onChange={toggleDeltas} />
                </div>
              </div>
              {sortedCategories.map(({ cat, ev, weight }, i) => {
                const blocked = state.blocked.includes(cat.id)
                const boosted = state.boosted.includes(cat.id)
                const invested = state.invested.includes(cat.id)
                const mg = optimal.marginals[cat.id]
                const recBlock = optimal.blocks.includes(cat.id)
                const recBoost = optimal.boosts.includes(cat.id)
                const recInvest = optimal.investments.includes(cat.id)
                const isRecommended = recBlock || recBoost || recInvest
                return (
                  <div
                    key={cat.id}
                    className={`rounded border px-2.5 py-2 ${
                      isRecommended ? 'border-emerald-500/35' : 'border-white/10'
                    }`}
                    style={{ background: zebraRowBg(i), opacity: blocked ? 0.55 : 1 }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <ScarabIcon url={categoryIconUrl(cat)} size={22} />
                        <span className="text-[12px] font-medium text-text truncate">{cat.name}</span>
                        <span
                          className="text-[9px] text-text-dim shrink-0"
                          title="What atlas levers exist for this category"
                        >
                          {atlasModifierLabel(cat.atlasModifier)}
                        </span>
                        {recBlock && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 shrink-0">
                            Rec: Block
                          </span>
                        )}
                        {recBoost && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/20 text-accent shrink-0">
                            Rec: Boost
                          </span>
                        )}
                        {recInvest && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 shrink-0">
                            Rec: Invest
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {cat.atlasModifier === 'blockable' && (
                          <Button
                            size="sm"
                            variant={blocked ? 'danger' : 'ghost'}
                            title="Remove this category from map scarab drops"
                            onClick={() =>
                              updateState((prev) => ({
                                ...prev,
                                blocked: toggleInList(prev.blocked, cat.id),
                                invested: prev.invested.filter((id) => id !== cat.id),
                              }))
                            }
                          >
                            Block
                          </Button>
                        )}
                        {cat.atlasModifier === 'boostable' && (
                          <Button
                            size="sm"
                            variant={boosted ? 'primary' : 'ghost'}
                            title="2× drop weight (atlas “more scarabs” for this category)"
                            onClick={() =>
                              updateState((prev) => ({
                                ...prev,
                                boosted: toggleInList(prev.boosted, cat.id),
                              }))
                            }
                          >
                            Boost
                          </Button>
                        )}
                        {cat.investmentBoost && (
                          <Button
                            size="sm"
                            variant={invested ? 'primary' : 'ghost'}
                            disabled={blocked}
                            title="1.5× drop weight from investment notables"
                            onClick={() =>
                              updateState((prev) => ({
                                ...prev,
                                invested: toggleInList(prev.invested, cat.id),
                                blocked: prev.blocked.filter((id) => id !== cat.id),
                              }))
                            }
                          >
                            Invest
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-dim">
                      <span title="Average chaos value of scarabs in this category">
                        Category EV <span className="text-text">{formatChaos(ev)}</span>
                      </span>
                      <span title="Total drop weight in this category">
                        Weight <span className="text-text">{Math.round(weight)}</span>
                      </span>
                      <span>
                        Scarabs <span className="text-text">{cat.scarabs.length}</span>
                      </span>
                      {showDeltas && mg?.block != null && (
                        <span
                          className={mg.block >= 0 ? 'text-emerald-400' : 'text-red-400'}
                          title="Change to recommended pool EV if you block this category"
                        >
                          Δ block {mg.block >= 0 ? '+' : ''}
                          {formatChaos(mg.block)}
                        </span>
                      )}
                      {showDeltas && mg?.boost != null && (
                        <span
                          className={mg.boost >= 0 ? 'text-emerald-400' : 'text-red-400'}
                          title="Change to recommended pool EV if you boost this category"
                        >
                          Δ boost {mg.boost >= 0 ? '+' : ''}
                          {formatChaos(mg.boost)}
                        </span>
                      )}
                      {showDeltas && mg?.invest != null && (
                        <span
                          className={mg.invest >= 0 ? 'text-emerald-400' : 'text-red-400'}
                          title="Change to recommended pool EV if you invest this category"
                        >
                          Δ invest {mg.invest >= 0 ? '+' : ''}
                          {formatChaos(mg.invest)}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {tab === 'vendor' && (
            <VendorTab
              state={state}
              prices={prices}
              vendorSearch={vendorSearch}
              copied={copied}
              onGenerate={generateVendor}
              onCopy={() => void copyVendor()}
            />
          )}

          {tab === 'weights' && (
            <WeightsTab
              state={state}
              prices={prices}
              onSetWeight={(id, value) =>
                updateState((prev) => {
                  const next = { ...prev.weightOverrides }
                  if (value == null) delete next[id]
                  else next[id] = value
                  return { ...prev, weightOverrides: next }
                })
              }
              onSetPrice={(id, value) =>
                updateState((prev) => {
                  const next = { ...prev.priceOverrides }
                  if (value == null) delete next[id]
                  else next[id] = value
                  return { ...prev, priceOverrides: next }
                })
              }
              onResetWeights={() => updateState({ weightOverrides: {} })}
              onResetPrices={() => updateState({ priceOverrides: {} })}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function VendorTab({
  state,
  prices,
  vendorSearch,
  copied,
  onGenerate,
  onCopy,
}: {
  state: ScarabCalcState
  prices: Record<string, number>
  vendorSearch: string | null
  copied: boolean
  onGenerate: () => void
  onCopy: () => void
}): JSX.Element {
  const baseline = calculatePoolEV(catalog, state, prices, {
    blocks: [],
    boosts: [],
    investments: [],
    applyRemarkable: false,
  })
  const threshold = baseline / 3
  const order = catalog.vendorCategoryOrder

  const categories = [...catalog.categories].sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id) || a.name.localeCompare(b.name),
  )

  return (
    <div className="space-y-2">
      <div className="rounded border border-white/10 bg-black/20 px-2.5 py-2 text-[11px] text-text-dim leading-relaxed space-y-1.5">
        <div className="text-[12px] font-medium text-text">Vendor recipe helper</div>
        <p className="m-0">
          In PoE, selling <span className="text-text">any 3 scarabs</span> returns{' '}
          <span className="text-text">1 random</span> scarab. If the three you sell are cheap enough, the random one is
          profit on average.
        </p>
        <p className="m-0">
          Expected random return: <span className="text-accent font-medium">{formatChaos(baseline)}</span> (ignores
          atlas biases &amp; Remarkable Relics). Vendor a scarab when its price is under{' '}
          <span className="text-accent font-medium">{formatChaos(threshold)}</span> (return ÷ 3).
        </p>
        <p className="m-0 text-[10px]">
          Green <span className="text-emerald-400">+Xc</span> is estimated profit vs selling three of that scarab. Then
          generate a stash search to find them quickly.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={onGenerate}>
          Generate stash search
        </Button>
        {vendorSearch && (
          <>
            <input
              readOnly
              value={vendorSearch}
              className="flex-1 min-w-[140px] text-[11px] px-2 py-1 rounded border border-white/10 bg-black/30 text-text"
            />
            <Button size="sm" variant="secondary" onClick={onCopy}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </>
        )}
      </div>
      {categories.map((cat, i) => {
        const vendorable = cat.scarabs
          .filter((s) => getEffectivePrice(s, state, prices) < threshold)
          .sort((a, b) => getEffectivePrice(a, state, prices) - getEffectivePrice(b, state, prices))
        return (
          <div
            key={cat.id}
            className="rounded border border-white/10 px-2.5 py-2"
            style={{ background: zebraRowBg(i), opacity: vendorable.length ? 1 : 0.45 }}
          >
            <div className="flex justify-between text-[12px] items-center gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ScarabIcon url={categoryIconUrl(cat)} size={18} />
                <span className="font-medium truncate">{cat.name}</span>
              </div>
              <span className="text-text-dim text-[10px] shrink-0" title="Vendorable / total in category">
                {vendorable.length}/{cat.scarabs.length} to vendor
              </span>
            </div>
            {vendorable.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {vendorable.map((s) => {
                  const price = getEffectivePrice(s, state, prices)
                  const profit = baseline - price * 3
                  return (
                    <div key={s.id} className="flex justify-between gap-2 text-[10px] items-center">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ScarabIcon name={s.name} size={16} />
                        <span className="truncate text-text-dim" title={s.name}>
                          {shortenScarabName(s.name)}
                        </span>
                      </div>
                      <span className="shrink-0">
                        <span className="text-text" title="Market price">
                          {formatChaos(price)}
                        </span>
                        <span className="text-emerald-400 ml-2" title="Est. profit vs 3× this price">
                          +{formatChaos(profit)}
                        </span>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function WeightsTab({
  state,
  prices,
  onSetWeight,
  onSetPrice,
  onResetWeights,
  onResetPrices,
}: {
  state: ScarabCalcState
  prices: Record<string, number>
  onSetWeight: (id: string, value: number | null) => void
  onSetPrice: (id: string, value: number | null) => void
  onResetWeights: () => void
  onResetPrices: () => void
}): JSX.Element {
  const sorted = useMemo(() => {
    return [...catalog.categories]
      .map((cat) => ({ cat, ...calculateCategoryEV(cat, state, prices) }))
      .sort((a, b) => b.ev - a.ev)
  }, [state, prices])

  return (
    <div className="space-y-2">
      <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-text-dim leading-relaxed">
        <div className="text-[12px] font-medium text-amber-200 mb-1">Advanced overrides</div>
        <p className="m-0">
          Left column = drop weight (how often it appears). Right = chaos price. Gold/amber borders mean you overrode
          the default. Reset buttons restore datamined weights and live market prices.
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button size="sm" variant="ghost" onClick={onResetWeights}>
          Reset weights
        </Button>
        <Button size="sm" variant="ghost" onClick={onResetPrices}>
          Reset prices
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_64px_72px] gap-1.5 px-1 text-[9px] text-text-dim uppercase tracking-wide">
        <span>Scarab</span>
        <span className="text-right">Weight</span>
        <span className="text-right">Price (c)</span>
      </div>
      {sorted.map(({ cat, ev }, i) => (
        <div key={cat.id} className="rounded border border-white/10 px-2.5 py-2" style={{ background: zebraRowBg(i) }}>
          <div className="flex justify-between text-[12px] mb-1.5 items-center gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ScarabIcon url={categoryIconUrl(cat)} size={18} />
              <span className="font-medium truncate">{cat.name}</span>
            </div>
            <span className="text-text-dim text-[10px] shrink-0">EV {formatChaos(ev)}</span>
          </div>
          <div className="space-y-1">
            {cat.scarabs.map((s) => {
              const wOverride = state.weightOverrides[s.id]
              const pOverride = state.priceOverrides[s.id]
              const market = prices[s.name]
              return (
                <div key={s.id} className="grid grid-cols-[1fr_64px_72px] gap-1.5 items-center text-[10px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ScarabIcon name={s.name} size={16} />
                    <span className="truncate text-text-dim" title={s.name}>
                      {shortenScarabName(s.name)}
                    </span>
                  </div>
                  <input
                    className={`px-1.5 py-0.5 rounded border bg-black/30 text-text text-right ${
                      wOverride !== undefined ? 'border-accent' : 'border-white/10'
                    }`}
                    value={wOverride !== undefined ? wOverride : s.weight}
                    title={`Base ${s.weight}, effective ${Math.round(getEffectiveWeight(s, state))}`}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value)
                      onSetWeight(s.id, Number.isFinite(n) && n >= 0 ? n : null)
                    }}
                  />
                  <input
                    className={`px-1.5 py-0.5 rounded border bg-black/30 text-text text-right ${
                      pOverride !== undefined ? 'border-amber-400' : 'border-white/10'
                    }`}
                    value={pOverride !== undefined ? pOverride : market != null ? Math.round(market * 100) / 100 : ''}
                    placeholder={market != null ? String(Math.round(market * 100) / 100) : ''}
                    title={market != null ? `Market ${formatChaos(market)}` : 'No market price'}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value)
                      onSetPrice(s.id, Number.isFinite(n) && n >= 0 ? n : null)
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
