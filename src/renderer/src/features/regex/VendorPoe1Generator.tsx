import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CloseSmall, Diamond, LinkOne, Magic, Plus, Search } from '@icon-park/react'
import { QualifierSection, TAB_COLORS, TabSeparator, ToggleRow, usePersistedJSON, useRegexKey } from './mapmods-helpers'
import { FilterChip } from '../../components/primitives/FilterChip'
import { InfoChip } from '../../shared/InfoChip'
import { DismissibleTip } from '../../shared/DismissibleTip'
import { ErrorBanner } from '../../components/ErrorBanner'
import { buildVendorPoe1GroupsRegex, buildVendorPoe1Warnings } from './vendor-poe1-engine'
import { generateVendorPoe1PresetTags } from './vendor-poe1-preset-tags'
import {
  DEFAULT_VENDOR_POE1_GROUPS_STATE,
  DEFAULT_VENDOR_POE1_SETTINGS,
  VENDOR_POE1_TABS,
  isVendorPoe1GroupsEmpty,
  qualifiersToVendorPoe1Groups,
  sanitizeVendorPoe1Groups,
  vendorPoe1GroupsToQualifiers,
  type VendorPoe1BooleanGroup,
  type VendorPoe1Settings,
  type VendorPoe1GroupsState,
  type VendorPoe1TabKey,
} from '@shared/data/regex/vendor-poe1-toggles'
import { regexGems } from '@shared/data/regex/vendor/gems/Generated.Gems.English'
import socketRed from '../../assets/sockets/socket-red.png'
import socketGreen from '../../assets/sockets/socket-green.png'
import socketBlue from '../../assets/sockets/socket-blue.png'
import socketColorless from '../../assets/sockets/socket-colorless.png'
import socketLink from '../../assets/sockets/socket-link.png'
import type { RegexPreset, RegexPresetTag } from '@shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

/** Per-category-tab icon. */
const TAB_ICONS: Record<VendorPoe1TabKey, typeof Magic> = {
  links: LinkOne,
  item: Magic,
  gems: Diamond,
}

/** Socket-chain art for link rows. '*' is the 3.29 colorless (any-color) socket. */
const SOCKET_IMG: Record<string, string> = {
  r: socketRed,
  g: socketGreen,
  b: socketBlue,
  '*': socketColorless,
  '-': socketLink,
}

/** Unchecked-label tints for the gem list (poe.re's palette); white gems keep the
 *  default dim text. */
const GEM_LABEL_COLORS: Record<string, string | undefined> = {
  r: '#fab4bb',
  g: '#c2ffe3',
  b: '#8c7df0',
  w: undefined,
}

const GEM_SECTIONS: Array<{ c: string; label: string }> = [
  { c: 'r', label: 'Red gems' },
  { c: 'g', label: 'Green gems' },
  { c: 'b', label: 'Blue gems' },
  { c: 'w', label: 'White gems' },
]

function SocketChain({ pattern }: { pattern: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-[2px] align-middle">
      {pattern.split('').map((c, i) => (
        <img
          key={`${c}-${i}`}
          src={SOCKET_IMG[c]}
          alt={c === '-' ? '' : c}
          style={c === '-' ? { width: 10, height: 10 } : { width: 16, height: 16 }}
        />
      ))}
    </span>
  )
}

/** Row label for a socket toggle: the chain art plus a compact text tag ("rrb",
 *  "Any 3-link"). Pure-pattern labels drop their dashes like poe.re's link-text. */
function socketRowLabel(label: string, sockets: string): React.ReactNode {
  const text = label === sockets ? label.replaceAll('-', '') : label
  return (
    <span className="flex items-center gap-2">
      <SocketChain pattern={sockets} />
      <span>{text}</span>
    </span>
  )
}

/** Aggregate auto-tags across all groups (+ a "N groups" marker when grouped), so
 *  preset name-derivation and the matchesPreset dedup keep working. */
function vendorPoe1GroupsTags(state: VendorPoe1GroupsState): RegexPresetTag[] {
  const tags = state.groups.flatMap((g) => generateVendorPoe1PresetTags(g))
  if (state.groups.length > 1) {
    tags.push({ text: `${state.groups.length} groups`, color: TAB_COLORS.qualifiers, source: 'qualifier' })
  }
  return tags
}

/** Per-category selected counts as compact parts (e.g. ["3 links", "2 gems"]),
 *  singular/plural aware. The pill renders these joined by a bold "OR". */
function vendorPoe1GroupSummary(group: VendorPoe1Settings): string[] {
  const counts: Record<VendorPoe1TabKey, number> = { links: 0, item: 0, gems: 0 }
  for (const tab of VENDOR_POE1_TABS) {
    for (const section of tab.sections) {
      for (const tg of section.toggles) {
        if ((group[tg.group] as Record<string, boolean>)[tg.field]) counts[tab.key]++
      }
    }
  }
  counts.gems = group.gems.length

  const parts: string[] = []
  if (counts.links) parts.push(`${counts.links} ${counts.links === 1 ? 'link' : 'links'}`)
  if (counts.item) parts.push(`${counts.item} ${counts.item === 1 ? 'mod' : 'mods'}`)
  if (counts.gems) parts.push(`${counts.gems} ${counts.gems === 1 ? 'gem' : 'gems'}`)
  return parts
}

export const VendorPoe1Generator = forwardRef<GeneratorHandle, GeneratorProps>(function VendorPoe1Generator(
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
  const [state, setState] = usePersistedJSON<VendorPoe1GroupsState>(
    key('vendor-groups'),
    DEFAULT_VENDOR_POE1_GROUPS_STATE,
    sanitizeVendorPoe1Groups,
  )
  const [tab, setTab] = useState<VendorPoe1TabKey>('links')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Clamp against any out-of-range persisted id (e.g. after a group was removed).
  const selectedGroupId = Math.min(Math.max(0, state.selectedGroupId), state.groups.length - 1)
  const selectedGroup = state.groups[selectedGroupId]

  const regex = buildVendorPoe1GroupsRegex(state.groups)
  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  const warnings = buildVendorPoe1Warnings(state.groups)

  // Emit auto-tags whenever the selection changes (ref keeps callback identity out of deps).
  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])
  useEffect(() => {
    onAutoTagsChangeRef.current(vendorPoe1GroupsTags(state))
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
        qualifiers: vendorPoe1GroupsToQualifiers(state),
      }),
      applyPreset: (preset: RegexPreset) => {
        setState(qualifiersToVendorPoe1Groups(preset.qualifiers ?? {}))
      },
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'vendor') return false
        const fresh = vendorPoe1GroupsTags(state)
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
  const updateSelectedGroup = (fn: (g: VendorPoe1Settings) => VendorPoe1Settings): void => {
    setState((prev) => {
      const id = Math.min(Math.max(0, prev.selectedGroupId), prev.groups.length - 1)
      return { ...prev, groups: prev.groups.map((g, i) => (i === id ? fn(g) : g)) }
    })
  }

  const toggleField = (group: VendorPoe1BooleanGroup, field: string): void => {
    updateSelectedGroup((g) => {
      const next = structuredClone(g)
      const obj = next[group] as Record<string, boolean>
      obj[field] = !obj[field]
      return next
    })
  }

  const toggleGem = (id: number): void => {
    updateSelectedGroup((g) => ({
      ...g,
      gems: g.gems.includes(id) ? g.gems.filter((x) => x !== id) : [...g.gems, id],
    }))
  }

  const selectGroup = (i: number): void =>
    setState((prev) => ({ ...prev, selectedGroupId: Math.min(Math.max(0, i), prev.groups.length - 1) }))

  const addGroup = (): void =>
    setState((prev) => ({
      groups: [...prev.groups, structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)],
      selectedGroupId: prev.groups.length,
    }))

  const removeGroup = (i: number): void =>
    setState((prev) => {
      const groups = prev.groups.filter((_, idx) => idx !== i)
      if (groups.length === 0) groups.push(structuredClone(DEFAULT_VENDOR_POE1_SETTINGS))
      let sel = prev.selectedGroupId
      if (sel > i) sel -= 1
      sel = Math.min(Math.max(0, sel), groups.length - 1)
      return { groups, selectedGroupId: sel }
    })

  const activeTab = VENDOR_POE1_TABS.find((t) => t.key === tab) ?? VENDOR_POE1_TABS[0]
  const matchesSearch = (label: string): boolean => !search || label.toLowerCase().includes(search.toLowerCase())

  // Alphabetized gem rows per color section; static dataset, computed once.
  const gemsByColor = useMemo(() => {
    const byColor: Record<string, Array<{ id: number; name: string }>> = { r: [], g: [], b: [], w: [] }
    for (const token of regexGems.tokens) {
      const bucket = byColor[token.options.c]
      if (bucket) bucket.push({ id: token.id, name: token.rawText.replaceAll('|', ' ') })
    }
    for (const c of Object.keys(byColor)) byColor[c].sort((a, b) => a.name.localeCompare(b.name))
    return byColor
  }, [])

  // Per-category-tab count for the badges, over the selected group.
  const tabCount = (tabKey: VendorPoe1TabKey): number => {
    if (tabKey === 'gems') return selectedGroup.gems.length
    const t = VENDOR_POE1_TABS.find((x) => x.key === tabKey)
    let n = 0
    if (t) {
      for (const section of t.sections) {
        for (const tg of section.toggles) {
          if ((selectedGroup[tg.group] as Record<string, boolean>)[tg.field]) n++
        }
      }
    }
    return n
  }

  const showGroupBar = !isVendorPoe1GroupsEmpty(state)

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

      {/* Conflict warnings (poe.re parity), e.g. +1 wand together with base=wand. */}
      <ErrorBanner message={warnings} tone="warn" inline />

      {sharedSavedPresets}

      {/* Group bar - hidden until the first condition is ticked. */}
      {showGroupBar && (
        <div className="flex flex-col gap-1 px-2 pt-2 pb-1 bg-bg-card border-b border-border">
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {state.groups.map((g, i) => {
              const isSel = i === selectedGroupId
              const summary = vendorPoe1GroupSummary(g)
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
            {/* Plain button (not FilterChip) so it matches the group pills' height exactly. */}
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
          <DismissibleTip id="vendor-poe1.groups">
            Conditions in a group match with OR; separate groups must all match (AND).
          </DismissibleTip>
        </div>
      )}

      {/* Category tab strip */}
      <div className="flex gap-1 px-2 pt-1 pb-0 bg-bg-card">
        {VENDOR_POE1_TABS.map((t, i) => {
          const isActive = tab === t.key
          const count = tabCount(t.key)
          const Icon = TAB_ICONS[t.key]
          const prev = VENDOR_POE1_TABS[i - 1]
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
              {section.caption && <div className="px-3 pb-[4px] text-[10px] text-text-dim">{section.caption}</div>}
              {visible.map((t, i) => (
                <ToggleRow
                  key={t.field}
                  label={t.sockets ? socketRowLabel(t.label, t.sockets) : t.label}
                  checked={(selectedGroup[t.group] as Record<string, boolean>)[t.field]}
                  onChange={() => toggleField(t.group, t.field)}
                  alt={i % 2 === 1}
                />
              ))}
            </QualifierSection>
          )
        })}

        {/* Gems tab renders the color-sectioned gem list, filtered by the same search. */}
        {tab === 'gems' &&
          GEM_SECTIONS.map((section) => {
            const visible = gemsByColor[section.c].filter((g) => matchesSearch(g.name))
            if (visible.length === 0) return null
            return (
              <QualifierSection key={section.label} label={section.label}>
                {visible.map((g, i) => (
                  <ToggleRow
                    key={g.id}
                    label={g.name}
                    labelColor={GEM_LABEL_COLORS[section.c]}
                    checked={selectedGroup.gems.includes(g.id)}
                    onChange={() => toggleGem(g.id)}
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
