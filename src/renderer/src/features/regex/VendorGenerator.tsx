import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Search, CloseSmall, Magic, ListView, Level, Plus } from '@icon-park/react'
import { TAB_COLORS, RegexCheckbox, TabSeparator, useRegexKey, usePersistedJSON } from './mapmods-helpers'
import { FilterChip } from '../../components/primitives/FilterChip'
import { ScrubInput } from '../../components/primitives/ScrubInput'
import { InfoChip } from '../../shared/InfoChip'
import { DismissibleTip } from '../../shared/DismissibleTip'
import { buildVendorGroupsRegex, type VendorSettings } from './vendor-engine'
import { generateVendorPresetTags } from './vendor-preset-tags'
import {
  VENDOR_TABS,
  DEFAULT_VENDOR_SETTINGS,
  DEFAULT_VENDOR_GROUPS_STATE,
  vendorGroupsToQualifiers,
  qualifiersToVendorGroups,
  isVendorGroupsEmpty,
  ensureVendorGroupsMigrated,
  type VendorTabKey,
  type VendorGroupsState,
} from '../../../../shared/data/regex/vendor-toggles'
import type { RegexPreset, RegexPresetTag } from '../../../../shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

/** Per-category-tab icon. */
const TAB_ICONS: Record<VendorTabKey, typeof Magic> = {
  mods: Magic,
  item: ListView,
  class: Level,
}

/** The two numeric level ranges on the Item tab. Declared as data so the search
 *  filter can match individual rows by their real labels (same as the toggle
 *  sections) instead of a coarse section-name guard. */
const LEVEL_SECTIONS: Array<{
  label: string
  group: 'itemLevel' | 'characterLevel'
  rows: Array<{ label: string; bound: 'min' | 'max' }>
}> = [
  {
    label: 'ITEM LEVEL',
    group: 'itemLevel',
    rows: [
      { label: 'Min item level', bound: 'min' },
      { label: 'Max item level', bound: 'max' },
    ],
  },
  {
    label: 'CHARACTER LEVEL',
    group: 'characterLevel',
    rows: [
      { label: 'Min character level', bound: 'min' },
      { label: 'Max character level', bound: 'max' },
    ],
  },
]

/** Aggregate auto-tags across all groups (+ a "N groups" marker when grouped), so
 *  preset name-derivation and the matchesPreset dedup keep working. */
function vendorGroupsTags(state: VendorGroupsState): RegexPresetTag[] {
  const tags = state.groups.flatMap((g) => generateVendorPresetTags(g))
  if (state.groups.length > 1) {
    tags.push({ text: `${state.groups.length} groups`, color: TAB_COLORS.qualifiers, source: 'qualifier' })
  }
  return tags
}

/** Per-category selected counts as compact parts (e.g. ["3 mods", "2 classes"]),
 *  singular/plural aware. Empty array when the group has nothing selected. The
 *  "item" bucket folds in the two level ranges. The pill renders these joined by a
 *  bold "OR" (within-group conditions are OR'd). */
function vendorGroupSummary(group: VendorSettings): string[] {
  const counts: Record<VendorTabKey, number> = { mods: 0, item: 0, class: 0 }
  for (const tab of VENDOR_TABS) {
    for (const section of tab.sections) {
      for (const tg of section.toggles) {
        if ((group[tg.group] as Record<string, boolean>)[tg.field]) counts[tab.key]++
      }
    }
  }
  if (group.itemLevel.min !== 0 || group.itemLevel.max !== 0) counts.item++
  if (group.characterLevel.min !== 0 || group.characterLevel.max !== 0) counts.item++

  const parts: string[] = []
  if (counts.mods) parts.push(`${counts.mods} ${counts.mods === 1 ? 'mod' : 'mods'}`)
  if (counts.item) parts.push(`${counts.item} ${counts.item === 1 ? 'item' : 'items'}`)
  if (counts.class) parts.push(`${counts.class} ${counts.class === 1 ? 'class' : 'classes'}`)
  return parts
}

export const VendorGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function VendorGenerator(
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
  // Migrate the legacy single-settings key into the grouped key. Must run in render
  // body BEFORE usePersistedJSON's lazy initializer reads the key (a useEffect would
  // run too late); idempotent + cheap, mirroring ensureLegacyRegexKeysMigrated in
  // RegexGenerator.
  ensureVendorGroupsMigrated(key('vendor-settings'), key('vendor-groups'))
  const [state, setState] = usePersistedJSON<VendorGroupsState>(key('vendor-groups'), DEFAULT_VENDOR_GROUPS_STATE)
  const [tab, setTab] = useState<VendorTabKey>('mods')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Clamp against any out-of-range persisted id (e.g. after a group was removed).
  const selectedGroupId = Math.min(Math.max(0, state.selectedGroupId), state.groups.length - 1)
  const selectedGroup = state.groups[selectedGroupId]

  const regex = buildVendorGroupsRegex(state.groups)
  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  // Emit auto-tags whenever the selection changes (ref keeps callback identity out of deps).
  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])
  useEffect(() => {
    onAutoTagsChangeRef.current(vendorGroupsTags(state))
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
        qualifiers: vendorGroupsToQualifiers(state),
      }),
      applyPreset: (preset: RegexPreset) => {
        setState(qualifiersToVendorGroups(preset.qualifiers ?? {}))
      },
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'vendor') return false
        const fresh = vendorGroupsTags(state)
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

  // ---- Group operations (immutable; always edit the clamped selected group) ----
  const updateSelectedGroup = (fn: (g: VendorSettings) => VendorSettings): void => {
    setState((prev) => {
      const id = Math.min(Math.max(0, prev.selectedGroupId), prev.groups.length - 1)
      return { ...prev, groups: prev.groups.map((g, i) => (i === id ? fn(g) : g)) }
    })
  }

  const toggleField = (group: keyof VendorSettings, field: string): void => {
    updateSelectedGroup((g) => {
      const next = structuredClone(g)
      const obj = next[group] as Record<string, boolean>
      obj[field] = !obj[field]
      return next
    })
  }

  const setLevel = (group: 'itemLevel' | 'characterLevel', bound: 'min' | 'max', v: number | null): void => {
    updateSelectedGroup((g) => ({
      ...g,
      [group]: { ...g[group], [bound]: v == null ? 0 : Math.max(0, Math.min(100, v)) },
    }))
  }

  const selectGroup = (i: number): void =>
    setState((prev) => ({ ...prev, selectedGroupId: Math.min(Math.max(0, i), prev.groups.length - 1) }))

  const addGroup = (): void =>
    setState((prev) => ({
      groups: [...prev.groups, structuredClone(DEFAULT_VENDOR_SETTINGS)],
      selectedGroupId: prev.groups.length,
    }))

  const removeGroup = (i: number): void =>
    setState((prev) => {
      const groups = prev.groups.filter((_, idx) => idx !== i)
      if (groups.length === 0) groups.push(structuredClone(DEFAULT_VENDOR_SETTINGS))
      let sel = prev.selectedGroupId
      if (sel > i) sel -= 1
      sel = Math.min(Math.max(0, sel), groups.length - 1)
      return { groups, selectedGroupId: sel }
    })

  const activeTab = VENDOR_TABS.find((t) => t.key === tab) ?? VENDOR_TABS[0]
  const matchesSearch = (label: string): boolean => !search || label.toLowerCase().includes(search.toLowerCase())

  // Per-category-tab count for the badges, over the selected group.
  const tabCount = (tabKey: VendorTabKey): number => {
    const t = VENDOR_TABS.find((x) => x.key === tabKey)
    let n = 0
    if (t) {
      for (const section of t.sections) {
        for (const tg of section.toggles) {
          if ((selectedGroup[tg.group] as Record<string, boolean>)[tg.field]) n++
        }
      }
    }
    if (tabKey === 'item') {
      if (selectedGroup.itemLevel.min !== 0 || selectedGroup.itemLevel.max !== 0) n++
      if (selectedGroup.characterLevel.min !== 0 || selectedGroup.characterLevel.max !== 0) n++
    }
    return n
  }

  const showGroupBar = !isVendorGroupsEmpty(state)

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
              placeholder="Search options..."
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

      {/* Group bar - hidden until the first condition is ticked. */}
      {showGroupBar && (
        <div className="flex flex-col gap-1 px-2 pt-2 pb-1 bg-bg-card border-b border-border">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {state.groups.map((g, i) => {
              const isSel = i === selectedGroupId
              const summary = vendorGroupSummary(g)
              return (
                <Fragment key={`group-${i}`}>
                  {i > 0 && <span className="text-[9px] font-bold text-text-dim px-[2px] shrink-0">AND</span>}
                  <button
                    onClick={() => selectGroup(i)}
                    className="flex items-center gap-1 px-2 py-[4px] rounded text-[11px] font-semibold border-none cursor-pointer shrink-0"
                    style={{
                      background: isSel ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
                      color: isSel ? '#171821' : 'var(--text-dim)',
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      {summary.length === 0 ? (
                        <span style={{ fontWeight: 500 }}>empty</span>
                      ) : (
                        summary.map((p, idx) => (
                          <Fragment key={p}>
                            {idx > 0 && <span className="font-bold">OR</span>}
                            <span style={{ fontWeight: 500 }}>{p}</span>
                          </Fragment>
                        ))
                      )}
                    </span>
                    {state.groups.length > 1 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          removeGroup(i)
                        }}
                        className="flex items-center opacity-70 hover:opacity-100"
                        style={{ marginLeft: 2 }}
                      >
                        <CloseSmall size={12} theme="outline" fill="currentColor" />
                      </span>
                    )}
                  </button>
                </Fragment>
              )
            })}
            {/* Plain button (not FilterChip) so it matches the group pills' height exactly:
                same padding, no border, same text size. */}
            <button
              onClick={addGroup}
              className="flex items-center gap-1 px-2 py-[4px] rounded text-[11px] font-semibold border-none cursor-pointer shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--accent)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
            >
              <Plus size={12} theme="outline" fill="currentColor" /> Group
            </button>
          </div>
          <DismissibleTip id="vendor.groups">
            Conditions in a group match with OR; separate groups must all match (AND).
          </DismissibleTip>
        </div>
      )}

      {/* Category tab strip */}
      <div className="flex gap-1 px-2 pt-1 pb-0 bg-bg-card">
        {VENDOR_TABS.map((t, i) => {
          const isActive = tab === t.key
          const count = tabCount(t.key)
          const Icon = TAB_ICONS[t.key]
          const prev = VENDOR_TABS[i - 1]
          const showSep = i > 0 && tab !== prev.key && !isActive
          return (
            <Fragment key={t.key}>
              {showSep && <TabSeparator />}
              <button
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-between px-3 text-[11px] py-[5px] border-none cursor-pointer transition-colors relative ${isActive ? 'regex-tab-active' : ''}`}
                style={{
                  background: isActive ? 'var(--bg-solid)' : 'transparent',
                  color: isActive ? TAB_COLORS.qualifiers : 'var(--text-dim)',
                  fontWeight: 600,
                  borderRadius: isActive ? '6px 6px 0 0' : '6px',
                  padding: isActive ? '5px 12px' : '1px 11px',
                  ...(isActive ? {} : { margin: '4px 1px' }),
                  minHeight: isActive ? 30 : undefined,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span className="flex items-center gap-[6px]">
                  <Icon size={15} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                  {t.label}
                </span>
                {count > 0 && (
                  <span style={{ transform: 'translateY(1px)' }}>
                    <InfoChip color={TAB_COLORS.qualifiers}>
                      <span className="font-bold">{count}</span>
                    </InfoChip>
                  </span>
                )}
              </button>
            </Fragment>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto bg-bg-card">
        {activeTab.sections.map((section) => {
          const visible = section.toggles.filter((t) => matchesSearch(t.label))
          if (visible.length === 0) return null
          return (
            <QualifierSection key={section.label} label={section.label}>
              {visible.map((t, i) => (
                <ToggleRow
                  key={t.field}
                  label={t.label}
                  checked={(selectedGroup[t.group] as Record<string, boolean>)[t.field]}
                  onChange={() => toggleField(t.group, t.field)}
                  alt={i % 2 === 1}
                />
              ))}
            </QualifierSection>
          )
        })}

        {/* Item tab also renders the two level ranges as numeric inputs, filtered
            per-row by the search the same way the toggle sections are. */}
        {tab === 'item' &&
          LEVEL_SECTIONS.map((section) => {
            const visible = section.rows.filter((r) => matchesSearch(r.label))
            if (visible.length === 0) return null
            return (
              <QualifierSection key={section.label} label={section.label}>
                {visible.map((r, i) => (
                  <LevelRow
                    key={r.bound}
                    label={r.label}
                    value={selectedGroup[section.group][r.bound]}
                    onChange={(v) => setLevel(section.group, r.bound, v)}
                    alt={i % 2 === 1}
                  />
                ))}
              </QualifierSection>
            )
          })}
      </div>
    </>
  )
})

function QualifierSection({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-[8px] sticky-group-header sticky top-0 z-[1]"
        style={{ height: 39, boxSizing: 'border-box' }}
      >
        <span className="text-[10px] uppercase tracking-wider font-bold flex-1 text-text">{label}</span>
      </div>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
  alt = false,
}: {
  label: string
  checked: boolean
  onChange: () => void
  alt?: boolean
}): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 px-3 py-[6px] cursor-pointer select-none"
      style={{ background: alt ? 'rgba(255,255,255,0.02)' : 'transparent' }}
      onClick={onChange}
    >
      <RegexCheckbox checked={checked} color={TAB_COLORS.qualifiers} />
      <span className="text-[11px] flex-1" style={{ color: checked ? 'var(--text)' : 'var(--text-dim)' }}>
        {label}
      </span>
    </div>
  )
}

function LevelRow({
  label,
  value,
  onChange,
  alt = false,
}: {
  label: string
  value: number
  onChange: (v: number | null) => void
  alt?: boolean
}): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 px-3 py-[6px]"
      style={{ background: alt ? 'rgba(255,255,255,0.02)' : 'transparent' }}
    >
      <span className="text-[11px] flex-1 text-text">{label}</span>
      <ScrubInput value={value === 0 ? null : value} placeholder="0" step={1} min={0} max={100} onChange={onChange} />
    </div>
  )
}
