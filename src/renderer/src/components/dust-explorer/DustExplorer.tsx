import { useState, useMemo, useEffect } from 'react'
import itemClassesData from '../../../../shared/data/items/item-classes.json'
import dustIcon from '../../assets/currency/thaumaturgic-dust.png'
import { chaosIcon } from '../../shared/icons'
import socketWhite from '../../assets/sockets/socket-white.png'
import { DustEntry, ActiveFilter, FilterType, SortKey, SortDir } from './types'
import {
  cachedBaseEntries,
  ALL_FILTER_TYPES,
  persistedState,
  COL_PRICE,
  COL_DUST,
  COL_DPC,
  COL_DPCS,
} from './constants'
import { scaleRange } from './utils'
import { SortHeader } from './SortHeader'
import { FilterRow, EmptyFilterRow } from './FilterRow'
import { DustEntryRow } from './DustEntryRow'

const itemClasses = itemClassesData as Record<string, { bases: string[]; size: [number, number] }>
const classMap: Record<string, string> = {}
for (const [cls, { bases }] of Object.entries(itemClasses)) {
  for (const base of bases) classMap[base] = cls
}

export function DustExplorer({ onSelectItem }: { onSelectItem?: () => void } = {}): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>(persistedState.sortKey)
  const [sortDir, setSortDir] = useState<SortDir>(persistedState.sortDir)
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [divineRate, setDivineRate] = useState(0)
  const [mirrorRate, setMirrorRate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFiltersState] = useState<ActiveFilter[]>(persistedState.filters)

  const setFilters = (fn: ActiveFilter[] | ((prev: ActiveFilter[]) => ActiveFilter[])) => {
    setFiltersState((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn
      persistedState.filters = next
      return next
    })
  }

  const baseEntries = cachedBaseEntries

  useEffect(() => {
    let cancelled = false
    const fetchPrices = async (attempt = 0): Promise<void> => {
      try {
        const settings = await window.api.getSettings()
        const result: Record<string, number> = {}
        const names = baseEntries.map((e) => e.name)
        const chunkSize = 200
        for (let i = 0; i < names.length; i += chunkSize) {
          const chunk = names.slice(i, i + chunkSize)
          const p = await window.api.batchLookupPrices(chunk, settings.league)
          for (const [name, info] of Object.entries(p)) {
            if (info?.chaosValue) result[name] = info.chaosValue
          }
        }
        if (cancelled) return
        // Retry up to 3 times if we got no prices (cache may not be ready yet)
        if (Object.keys(result).length === 0 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000))
          if (!cancelled) return fetchPrices(attempt + 1)
          return
        }
        setPrices(result)
        const currPrices = await window.api.batchLookupPrices(['Divine Orb', 'Mirror of Kalandra'], settings.league)
        const divPrice = currPrices['Divine Orb']?.chaosValue ?? 0
        const mirPrice = currPrices['Mirror of Kalandra']?.chaosValue ?? 0
        if (divPrice > 0) setDivineRate(divPrice)
        if (mirPrice > 0) setMirrorRate(mirPrice)
      } catch {
        if (!cancelled && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000))
          if (!cancelled) return fetchPrices(attempt + 1)
          return
        }
      }
      setLoading(false)
    }
    fetchPrices()
    return () => {
      cancelled = true
    }
  }, [baseEntries])

  const entries: DustEntry[] = useMemo(() => {
    return baseEntries
      .map((e) => {
        const chaos = prices[e.name] ?? null
        const dpc = chaos && chaos > 0 ? e.dustIlvl84 / chaos : null
        const dpcps = dpc !== null ? dpc / e.slots : null
        return { ...e, chaosValue: chaos, dustPerChaos: dpc, dustPerChaosPerSlot: dpcps }
      })
      .filter((e) => e.chaosValue !== null && e.dustPerChaos !== null && e.dustPerChaosPerSlot !== null)
  }, [baseEntries, prices])

  const maxValues = useMemo(
    () => ({
      chaosValue: Math.max(...entries.map((e) => e.chaosValue ?? 0), 1),
      dustIlvl84: Math.max(...entries.map((e) => e.dustIlvl84), 1),
      dustPerChaos: Math.max(...entries.map((e) => e.dustPerChaos ?? 0), 1),
      dustPerChaosPerSlot: Math.max(...entries.map((e) => e.dustPerChaosPerSlot ?? 0), 1),
    }),
    [entries],
  )

  const minValues = useMemo(
    () => ({
      chaosValue: 0,
      dustIlvl84: entries.length > 0 ? Math.min(...entries.map((e) => e.dustIlvl84)) : 0,
      dustPerChaos: 0,
      dustPerChaosPerSlot: 0,
    }),
    [entries],
  )

  const filtered = useMemo(() => {
    let result = entries
    for (const f of filters) {
      if (f.type === 'name') {
        const lower = f.value.toLowerCase()
        if (lower)
          result = result.filter(
            (e) => e.name.toLowerCase().includes(lower) || e.baseType.toLowerCase().includes(lower),
          )
      } else {
        const mn = minValues[f.type]
        const mx = maxValues[f.type]
        const minVal = scaleRange(f.min, mn, mx, f.type)
        const maxVal = scaleRange(f.max, mn, mx, f.type)
        result = result.filter((e) => {
          const v = e[f.type]
          if (v === null) return false
          return v >= minVal && v <= maxVal
        })
      }
    }
    return result
  }, [entries, filters, maxValues, minValues])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else {
        const av = a[sortKey] ?? -Infinity
        const bv = b[sortKey] ?? -Infinity
        cmp = av - bv
      }
      return sortDir === 'desc' ? -cmp : cmp
    })
    return copy
  }, [filtered, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      const next = sortDir === 'desc' ? 'asc' : 'desc'
      setSortDir(next)
      persistedState.sortDir = next
    } else {
      setSortKey(key)
      setSortDir('desc')
      persistedState.sortKey = key
      persistedState.sortDir = 'desc'
    }
  }

  const updateFilter = (idx: number, updates: Partial<ActiveFilter>) => {
    setFilters((prev) => prev.map((f, i) => (i === idx ? { ...f, ...updates } : f)))
  }

  const removeFilter = (idx: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== idx))
  }

  const changeFilterType = (idx: number, newType: FilterType) => {
    setFilters((prev) => prev.map((f, i) => (i === idx ? { type: newType, value: '', min: 0, max: 1000 } : f)))
  }

  const addFilterRow = () => {
    const used = new Set(filters.map((f) => f.type))
    const next = ALL_FILTER_TYPES.find((t) => !used.has(t))
    if (next) {
      setFilters((prev) => [...prev, { type: next, value: '', min: 0, max: 1000 }])
    }
  }

  const availableTypesFor = (currentType: FilterType) => {
    const used = new Set(filters.map((f) => f.type))
    return ALL_FILTER_TYPES.filter((t) => t === currentType || !used.has(t))
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="bg-bg-card px-3 py-[10px] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="section-title">Dust Explorer</span>
          <span className="text-[10px] text-text-dim">{loading ? 'Fetching prices...' : `${sorted.length} items`}</span>
        </div>

        {/* Filter rows */}
        {filters.length === 0 && (
          <EmptyFilterRow onAdd={(t) => setFilters([{ type: t, value: '', min: 0, max: 1000 }])} />
        )}

        {filters.map((f, idx) => (
          <FilterRow
            key={`${f.type}-${idx}`}
            filter={f}
            idx={idx}
            availableTypes={availableTypesFor(f.type)}
            minValues={minValues}
            maxValues={maxValues}
            divineRate={divineRate}
            mirrorRate={mirrorRate}
            onTypeChange={changeFilterType}
            onUpdate={updateFilter}
            onRemove={removeFilter}
          />
        ))}

        {/* Add another filter button */}
        {filters.length > 0 && filters.length < ALL_FILTER_TYPES.length && (
          <button onClick={addFilterRow} className="self-start px-3 py-1 text-[11px]">
            + Add another filter
          </button>
        )}
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-[6px] px-3 py-1 bg-bg-card border-b border-border">
        <div className="w-[22px] shrink-0" />
        <SortHeader label="Unique" sortKey="name" active={sortKey} dir={sortDir} onSort={handleSort} flex />
        <SortHeader
          label={<img src={chaosIcon} alt="" className="w-[10px] h-[10px]" />}
          sortKey="chaosValue"
          active={sortKey}
          dir={sortDir}
          onSort={handleSort}
          width={COL_PRICE}
        />
        <SortHeader
          label={<img src={dustIcon} alt="" className="w-[10px] h-[10px]" />}
          sortKey="dustIlvl84"
          active={sortKey}
          dir={sortDir}
          onSort={handleSort}
          width={COL_DUST}
        />
        <SortHeader
          label={
            <>
              <img src={dustIcon} alt="" className="w-[10px] h-[10px]" />
              <span>/</span>
              <img src={chaosIcon} alt="" className="w-[10px] h-[10px]" />
            </>
          }
          sortKey="dustPerChaos"
          active={sortKey}
          dir={sortDir}
          onSort={handleSort}
          width={COL_DPC}
        />
        <SortHeader
          label={
            <>
              <img src={dustIcon} alt="" className="w-[10px] h-[10px]" />
              <span>/</span>
              <img src={chaosIcon} alt="" className="w-[10px] h-[10px]" />
              <span>/</span>
              <img src={socketWhite} alt="" className="w-[10px] h-[10px]" />
            </>
          }
          sortKey="dustPerChaosPerSlot"
          active={sortKey}
          dir={sortDir}
          onSort={handleSort}
          width={COL_DPCS}
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto bg-bg-solid">
        {sorted.map((entry, i) => (
          <DustEntryRow
            key={entry.name}
            entry={entry}
            index={i}
            divineRate={divineRate}
            mirrorRate={mirrorRate}
            classMap={classMap}
            onSelectItem={onSelectItem}
          />
        ))}
      </div>

      {/* CSS for dual range thumb pointer events */}
      <style>{`
        .range-thumb::-webkit-slider-thumb {
          pointer-events: auto !important;
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--accent);
          border: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
