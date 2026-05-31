import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Search, CloseSmall, Magic, ListView, Level } from '@icon-park/react'
import { TAB_COLORS, RegexCheckbox, TabSeparator, useRegexKey, usePersistedJSON } from './mapmods-helpers'
import { FilterChip } from '../price-check/FilterChip'
import { ScrubInput } from './ScrubInput'
import { InfoChip } from '../../shared/InfoChip'
import { buildVendorRegex, type VendorSettings } from './vendor-engine'
import { generateVendorPresetTags } from './vendor-preset-tags'
import {
  VENDOR_TABS,
  DEFAULT_VENDOR_SETTINGS,
  vendorSettingsToQualifiers,
  qualifiersToVendorSettings,
  type VendorTabKey,
} from '../../../../shared/data/regex/vendor-toggles'
import type { RegexPreset } from '../../../../shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

/** Per-category-tab icon. Magic = affixes/mods, ListView = item base/rarity/level,
 *  Level = item-class. Two-tone to match the waystone tab icons. */
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

export const VendorGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function VendorGenerator(
  {
    onRegexChange,
    onAutoTagsChange,
    sharedSaveChip,
    sharedLoadChip,
    sharedNewChip,
    sharedSavePanel,
    sharedSavedPresets,
  },
  ref,
) {
  const key = useRegexKey()
  const [settings, setSettings] = usePersistedJSON<VendorSettings>(key('vendor-settings'), DEFAULT_VENDOR_SETTINGS)
  const [tab, setTab] = useState<VendorTabKey>('mods')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  const regex = buildVendorRegex(settings)
  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  // Emit auto-tags whenever the selection changes (ref keeps callback identity out of deps).
  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])
  useEffect(() => {
    onAutoTagsChangeRef.current(generateVendorPresetTags(settings))
  }, [settings])

  useImperativeHandle(
    ref,
    () => ({
      getPresetPayload: () => ({
        avoid: [],
        want: [],
        wantMode: 'any',
        qualifiers: vendorSettingsToQualifiers(settings),
      }),
      applyPreset: (preset: RegexPreset) => {
        setSettings(qualifiersToVendorSettings(preset.qualifiers ?? {}))
      },
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'vendor') return false
        const fresh = generateVendorPresetTags(settings)
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
    [settings],
  )

  const toggleField = (group: keyof VendorSettings, field: string): void => {
    setSettings((prev) => {
      const next = structuredClone(prev)
      const obj = next[group] as Record<string, boolean>
      obj[field] = !obj[field]
      return next
    })
  }

  const setLevel = (group: 'itemLevel' | 'characterLevel', bound: 'min' | 'max', v: number | null): void => {
    setSettings((prev) => ({
      ...prev,
      [group]: { ...prev[group], [bound]: v == null ? 0 : Math.max(0, Math.min(100, v)) },
    }))
  }

  const activeTab = VENDOR_TABS.find((t) => t.key === tab) ?? VENDOR_TABS[0]
  const matchesSearch = (label: string): boolean => !search || label.toLowerCase().includes(search.toLowerCase())

  // Per-tab active-toggle counts for the badges.
  const tabCount = (tabKey: VendorTabKey): number => {
    const t = VENDOR_TABS.find((x) => x.key === tabKey)
    let n = 0
    if (t) {
      for (const section of t.sections) {
        for (const tg of section.toggles) {
          if ((settings[tg.group] as Record<string, boolean>)[tg.field]) n++
        }
      }
    }
    if (tabKey === 'item') {
      if (settings.itemLevel.min !== 0 || settings.itemLevel.max !== 0) n++
      if (settings.characterLevel.min !== 0 || settings.characterLevel.max !== 0) n++
    }
    return n
  }

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
            onClick={() => {
              setSearchOpen((v) => !v)
              if (searchOpen) setSearch('')
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

      {/* Category tab strip */}
      <div className="flex gap-1 px-2 pt-1 pb-0 bg-bg-card">
        {VENDOR_TABS.map((t, i) => {
          const isActive = tab === t.key
          const count = tabCount(t.key)
          const Icon = TAB_ICONS[t.key]
          // Separator only between two adjacent inactive tabs.
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
                  checked={(settings[t.group] as Record<string, boolean>)[t.field]}
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
                    value={settings[section.group][r.bound]}
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
