import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CloseSmall, Search } from '@icon-park/react'
import type { CategoryRegex, ItemRegex } from '@shared/data/regex/vendor/item/GeneratedItemMods'
import {
  DEFAULT_ITEMS_STATE,
  isRareOnlyClass,
  rareModKey,
  sanitizeItemsState,
  type ItemsBaseRef,
  type ItemsRarity,
  type ItemsRareMatchMode,
  type ItemsState,
} from '@shared/data/regex/items-state'
import type { RegexPreset } from '@shared/types'
import { FilterChip } from '../../components/primitives/FilterChip'
import { DismissibleTip } from '../../shared/DismissibleTip'
import { QualifierSection, ToggleRow, usePersistedJSON, useRegexKey } from './mapmods-helpers'
import type { GeneratorHandle, GeneratorProps } from './generator-types'
import { buildItemsAffixMap, buildItemsRegex, cleanItemsCategoryName, groupItemsCategories } from './items-engine'
import { generateItemsPresetTags } from './items-preset-tags'
import { ItemsBasePicker } from './ItemsBasePicker'
import { ItemsRareModRow } from './ItemsRareModRow'

/** The 3.4 MB mods dataset loads once per process on first tab open. Module
 *  promise (not per-mount) so remounts reuse the in-flight/finished load; the
 *  app relaunches on game switch so no invalidation is needed. */
let datasetPromise: Promise<Record<string, ItemRegex>> | null = null
function loadDataset(): Promise<Record<string, ItemRegex>> {
  if (!datasetPromise) {
    datasetPromise = import('@shared/data/regex/vendor/item/GeneratedItemMods').then(
      (m) => m.itemRegex,
      (err) => {
        datasetPromise = null
        throw err
      },
    )
  }
  return datasetPromise
}

const MATCH_MODES: Array<{ key: ItemsRareMatchMode; label: string }> = [
  { key: 'all', label: 'ALL mods' },
  { key: 'any', label: 'ANY mod' },
  { key: 'prefixSuffix', label: '1 Prefix + 1 Suffix' },
]

export const ItemsGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function ItemsGenerator(
  {
    onRegexChange,
    onAutoTagsChange,
    sharedSaveChip,
    sharedLoadChip,
    sharedNewChip,
    sharedSavePanel,
    sharedSavedPresets,
    onPanelOpen,
  },
  ref,
) {
  const key = useRegexKey()
  const [state, setState] = usePersistedJSON<ItemsState>(key('items-state'), DEFAULT_ITEMS_STATE, sanitizeItemsState)
  const [dataset, setDataset] = useState<Record<string, ItemRegex> | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [conflictsOpen, setConflictsOpen] = useState(false)

  useEffect(() => {
    let alive = true
    void loadDataset()
      .then((d) => {
        if (alive) setDataset(d)
      })
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [])

  const affixMap = useMemo(() => (dataset ? buildItemsAffixMap(dataset) : null), [dataset])
  const regex = affixMap ? buildItemsRegex(affixMap, state) : ''

  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])
  useEffect(() => {
    onAutoTagsChangeRef.current(generateItemsPresetTags(state))
  }, [state])

  useImperativeHandle(
    ref,
    () => ({
      closePanels: () => {
        setSearchOpen(false)
        setSearch('')
      },
      getPresetPayload: () => ({
        avoid: [],
        want: [],
        wantMode: 'any',
        qualifiers: {},
        itemCrafting: structuredClone(state),
      }),
      applyPreset: (preset: RegexPreset) => {
        setState(sanitizeItemsState(preset.itemCrafting))
      },
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'items') return false
        const fresh = generateItemsPresetTags(state)
          .map((t) => t.text)
          .sort()
          .join('|')
        const saved = (preset.tags ?? [])
          .filter((t) => !!t.source && t.source !== 'custom')
          .map((t) => t.text)
          .sort()
          .join('|')
        return fresh === saved
      },
    }),
    [state],
  )

  const setRarity = (rarity: ItemsRarity): void => {
    setState((prev) => ({ ...prev, rarity }))
  }

  const pickBase = (base: ItemsBaseRef): void => {
    setState((prev) => ({
      ...prev,
      itembase: base,
      // poe.re parity: heist classes only support rare items.
      rarity: isRareOnlyClass(base.baseType) ? 'Rare' : prev.rarity,
    }))
  }

  const toggleRareMod = (k: string): void => {
    setState((prev) => {
      const next = { ...prev, selectedRareMods: { ...prev.selectedRareMods } }
      if (next.selectedRareMods[k]) delete next.selectedRareMods[k]
      else next.selectedRareMods[k] = { values: {} }
      return next
    })
  }

  const setRareValue = (k: string, index: number, value: string): void => {
    setState((prev) => {
      const existing = prev.selectedRareMods[k] ?? { values: {} }
      return {
        ...prev,
        selectedRareMods: {
          ...prev.selectedRareMods,
          [k]: { values: { ...existing.values, [index]: value } },
        },
      }
    })
  }

  const toggleMagicMod = (
    basetype: string,
    category: string,
    affixName: string,
    affixDesc: string,
    affix: 'PREFIX' | 'SUFFIX',
  ): void => {
    setState((prev) => {
      const exists = prev.selectedMagicMods.some((m) => m.affixName === affixName && m.basetype === basetype)
      return {
        ...prev,
        selectedMagicMods: exists
          ? prev.selectedMagicMods.filter((m) => m.affixName !== affixName || m.basetype !== basetype)
          : [...prev.selectedMagicMods, { basetype, category, affixName, affixDesc, affix }],
      }
    })
  }

  const activeItem = state.itembase ? dataset?.[state.itembase.baseType] : undefined
  const groups = activeItem ? groupItemsCategories(activeItem.categoryRegex) : []
  const warnings = activeItem ? Array.from(new Set(activeItem.categoryRegex.flatMap((c) => c.warnings))) : []
  const rareOnly = state.itembase ? isRareOnlyClass(state.itembase.baseType) : false
  const matchesSearch = (label: string): boolean => !search || label.toLowerCase().includes(search.toLowerCase())
  const needsItemPick = state.rarity === 'Magic' && (!state.itembase || !state.itembase.item)

  return (
    <>
      <div className="flex flex-col px-3 py-2 border-b border-border bg-bg-card">
        <div className="flex items-center gap-[6px]">
          {sharedNewChip}
          <FilterChip
            label={
              <>
                <Search size={12} theme="outline" fill="currentColor" /> Search
              </>
            }
            active={searchOpen}
            solidInactive
            onClick={() => {
              if (searchOpen) {
                setSearchOpen(false)
                setSearch('')
              } else {
                setSearchOpen(true)
                onPanelOpen?.()
              }
            }}
          />
          {sharedSaveChip}
          {sharedLoadChip}
        </div>

        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: searchOpen ? 40 : 0, marginTop: searchOpen ? 8 : 0, opacity: searchOpen ? 1 : 0 }}
        >
          <div className="relative">
            <input
              type="text"
              placeholder="Search mods..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-[11px] bg-black/30 rounded px-2 py-[5px] border-none pr-6"
            />
            {search && (
              <div
                onClick={() => setSearch('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer text-text-dim hover:text-text"
              >
                <CloseSmall size={14} theme="outline" fill="currentColor" />
              </div>
            )}
          </div>
        </div>

        {sharedSavePanel}
      </div>

      {sharedSavedPresets}

      {/* Base + rarity row */}
      <div className="flex flex-col gap-2 px-3 py-2 bg-bg-card border-b border-border">
        <div className="flex items-center gap-[6px]">
          {(['Rare', 'Magic'] as const).map((r) => (
            <FilterChip
              key={r}
              label={r}
              active={state.rarity === r}
              disabled={r === 'Magic' && rareOnly}
              onClick={() => setRarity(r)}
            />
          ))}
          {rareOnly && <span className="text-[10px] text-text-dim">This base only supports rare items</span>}
        </div>
        <ItemsBasePicker
          rarity={state.rarity}
          itembase={needsItemPick ? null : state.itembase}
          onPick={pickBase}
          onClear={() => setState((prev) => ({ ...prev, itembase: null }))}
        />
        <DismissibleTip id="items.data-caveats">
          poe.re data caveats: cluster jewels are missing notables; open prefix/suffix does not work for magic synth
          items; magic items with influenced mods match any tier; some ranges can be weird.
        </DismissibleTip>
      </div>

      <div className="flex-1 overflow-y-auto bg-bg-card">
        {!dataset && !loadFailed && <div className="px-3 py-4 text-[11px] text-text-dim">Loading item data...</div>}

        {!dataset && loadFailed && (
          <div className="px-3 py-4 text-[11px] text-text-dim">
            Failed to load item data - close and reopen this tab to retry.
          </div>
        )}

        {dataset && !state.itembase && (
          <div className="px-3 py-4 text-[11px] text-text-dim">
            {state.rarity === 'Rare' ? 'Pick an item class to list its mods.' : 'Pick an item to match its magic name.'}
          </div>
        )}

        {dataset && state.itembase && needsItemPick && (
          <div className="px-3 py-4 text-[11px] text-text-dim">
            Pick a specific item - magic matching uses the item name.
          </div>
        )}

        {/* Rare mode */}
        {dataset && activeItem && state.rarity === 'Rare' && (
          <>
            <div className="flex items-center gap-[6px] px-3 py-2">
              {MATCH_MODES.map((m) => (
                <FilterChip
                  key={m.key}
                  label={m.label}
                  active={state.rareMatchMode === m.key}
                  onClick={() => setState((prev) => ({ ...prev, rareMatchMode: m.key }))}
                />
              ))}
            </div>
            {warnings.length > 0 && (
              <div className="px-3 pb-1">
                <FilterChip
                  label={`${conflictsOpen ? 'Hide' : 'Show'} mod conflicts (${warnings.length})`}
                  active={conflictsOpen}
                  solidInactive
                  onClick={() => setConflictsOpen(!conflictsOpen)}
                />
                {conflictsOpen &&
                  warnings.map((w) => (
                    <div key={w} className="text-[10px] text-text-dim px-1 pt-1">
                      duplicate: {w}
                    </div>
                  ))}
              </div>
            )}
            {groups.map((group) =>
              group.map((cat) => {
                const visible = cat.modifiers.filter((m) => matchesSearch(m.desc))
                if (visible.length === 0) return null
                return (
                  <QualifierSection key={cat.category} label={cleanItemsCategoryName(cat.category)}>
                    {visible.map((mod, i) => {
                      const k = rareModKey(activeItem.basetype, cat.category, mod.desc)
                      return (
                        <ItemsRareModRow
                          key={k}
                          mod={mod}
                          selection={state.selectedRareMods[k]}
                          onToggle={() => toggleRareMod(k)}
                          onValue={(index, value) => setRareValue(k, index, value)}
                          alt={i % 2 === 1}
                        />
                      )
                    })}
                  </QualifierSection>
                )
              }),
            )}
          </>
        )}

        {/* Magic mode */}
        {dataset && activeItem && state.rarity === 'Magic' && !needsItemPick && (
          <>
            <ToggleRow
              label="Only match if both prefix and suffix is found"
              checked={state.magicBothAffixes}
              onChange={() => setState((prev) => ({ ...prev, magicBothAffixes: !prev.magicBothAffixes }))}
            />
            <ToggleRow
              label="Match an open prefix or suffix"
              checked={state.magicOpenAffix}
              onChange={() => setState((prev) => ({ ...prev, magicOpenAffix: !prev.magicOpenAffix }))}
            />
            {groups.map((group) =>
              group.map((cat: CategoryRegex) =>
                cat.modifiers.map((mod) => {
                  const visible = mod.affixes.filter((a) => matchesSearch(a.name) || matchesSearch(mod.desc))
                  if (visible.length === 0) return null
                  return (
                    <QualifierSection
                      key={`${cat.category}-${mod.desc}`}
                      label={`${cleanItemsCategoryName(cat.category)}: ${mod.desc}`}
                    >
                      {[...visible].reverse().map((a, i) => (
                        <ToggleRow
                          key={a.name}
                          label={a.name}
                          checked={state.selectedMagicMods.some(
                            (m) => m.affixName === a.name && m.basetype === activeItem.basetype,
                          )}
                          onChange={() =>
                            toggleMagicMod(activeItem.basetype, cat.category, a.name, a.desc, mod.affixtype)
                          }
                          alt={i % 2 === 1}
                        />
                      ))}
                    </QualifierSection>
                  )
                }),
              ),
            )}
          </>
        )}
      </div>
    </>
  )
})
