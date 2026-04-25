import { useEffect, useRef, useState } from 'react'
import { ReactSortable } from 'react-sortablejs'
import { CloseSmall, Save } from '@icon-park/react'
import { POE_REGEX_MAX_LENGTH } from './regex-engine'
import { TagSourceIcon, loadStorage, tagChipStyle } from './mapmods-helpers'
import poereIconTight from '../../assets/other/poere-logo-tight.svg'
import { FilterChip } from '../price-check/FilterChip'
import { ErrorBanner } from '../ErrorBanner'
import { SavedPresets } from './SavedPresets'
import { InfoChip } from '../../shared/PriceChip'
import { CUSTOM_TAG_COLOR } from './preset-tags'
import { MapsGenerator } from './MapsGenerator'
import { CustomGenerator } from './CustomGenerator'
import type { GeneratorConfig, GeneratorHandle } from './generator-types'
import type { RegexPreset, RegexPresetTag } from '../../../../shared/types'

/** Registered regex generators. Adding a new one (e.g. vendor regex) is:
 *    1. Create a component matching the `GeneratorHandle` / `GeneratorProps` shape
 *    2. Add an entry here with its key + label
 *    3. Add a case in the component-switch below (see `renderActiveGenerator`)
 *  The registry drives the tab strip, localStorage key, and preset scoping. */
const GENERATORS = [
  { key: 'maps', label: 'Maps' },
  { key: 'custom', label: 'Custom' },
] as const satisfies readonly GeneratorConfig[]

type GeneratorKey = (typeof GENERATORS)[number]['key']

export function RegexGenerator(): JSX.Element {
  const [generator, _setGenerator] = useState<GeneratorKey>(() =>
    loadStorage('scalpel:regex:generator', 'maps' as GeneratorKey, (s) =>
      GENERATORS.some((g) => g.key === s) ? (s as GeneratorKey) : 'maps',
    ),
  )

  // Preset-bar tags stored per generator so switching tabs preserves in-progress saves.
  const savedTagsByGenerator = useRef<Record<string, (RegexPresetTag & { id: number })[]>>(
    (() => {
      const byGen = loadStorage(
        'scalpel:regex:presetTagsByGenerator',
        {} as Record<string, (RegexPresetTag & { id: number })[]>,
      )
      // Migrate legacy flat-array key on first run.
      if (Object.keys(byGen).length === 0) {
        const legacy = loadStorage<(RegexPresetTag & { id: number })[]>('scalpel:regex:presetTags', [])
        if (legacy.length > 0) {
          const currentGen = loadStorage('scalpel:regex:generator', 'maps', (s) =>
            GENERATORS.some((g) => g.key === s) ? (s as GeneratorKey) : 'maps',
          )
          byGen[currentGen] = legacy
        }
      }
      return byGen
    })(),
  )
  const [presetTags, setPresetTags] = useState<(RegexPresetTag & { id: number })[]>(
    () => savedTagsByGenerator.current[generator] ?? [],
  )
  useEffect(() => {
    savedTagsByGenerator.current[generator] = presetTags
    localStorage.setItem('scalpel:regex:presetTagsByGenerator', JSON.stringify(savedTagsByGenerator.current))
  }, [presetTags, generator])

  const [customTagInput, setCustomTagInput] = useState('')
  const [presets, setPresets] = useState<RegexPreset[]>([])
  const [copied, setCopied] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)
  const [macroTagError, setMacroTagError] = useState<string | null>(null)

  // Active generator pushes its current regex and auto-tags up here.
  const [regex, setRegex] = useState('')
  const [autoTags, setAutoTags] = useState<RegexPresetTag[] | null>(null)

  const mapsRef = useRef<GeneratorHandle>(null)
  const customRef = useRef<GeneratorHandle>(null)
  const activeHandleRef = generator === 'maps' ? mapsRef : customRef

  const setGenerator = (g: GeneratorKey): void => {
    // Stash current tags, restore target's.
    savedTagsByGenerator.current[generator] = presetTags
    localStorage.setItem('scalpel:regex:presetTagsByGenerator', JSON.stringify(savedTagsByGenerator.current))
    setPresetTags(savedTagsByGenerator.current[g] ?? [])
    setCustomTagInput('')
    setSaveOpen(false)
    localStorage.setItem('scalpel:regex:generator', g)
    _setGenerator(g)
  }

  useEffect(() => {
    window.api.getRegexPresets().then((loaded) => {
      // Migrate old presets that used 'name' instead of 'tags'.
      const migrated = loaded.map((p) =>
        p.tags
          ? p
          : { ...p, tags: [{ text: (p as unknown as { name: string }).name || 'preset', color: CUSTOM_TAG_COLOR }] },
      )
      setPresets(migrated)
      if (migrated.some((p) => (p.generator ?? 'maps') === generator)) setLoadOpen(true)
    })
  }, [])

  useEffect(() => {
    window.api.reportRegex(regex)
  }, [regex])

  // Merge fresh auto-tags from the active generator into presetTags. Generators that
  // don't produce auto-tags (e.g. Custom) emit `null` and this effect bails.
  useEffect(() => {
    if (autoTags == null) return
    setPresetTags((prev) => {
      const freshBySourceId = new Map<string | number, RegexPresetTag>()
      autoTags.forEach((t) => {
        if (t.sourceId != null) freshBySourceId.set(t.sourceId, t)
      })
      const updated = prev
        .filter((t) => t.source === 'custom' || t.sourceId == null || freshBySourceId.has(t.sourceId))
        .map((t) => {
          if (t.source === 'custom' || t.sourceId == null) return t
          const freshTag = freshBySourceId.get(t.sourceId)
          if (freshTag && freshTag.text !== t.text) return { ...t, text: freshTag.text, color: freshTag.color }
          return t
        })
      let nextId = Math.max(0, ...prev.map((t) => t.id)) + 1
      const existingSourceIds = new Set(updated.filter((t) => t.sourceId != null).map((t) => t.sourceId))
      for (const ft of autoTags) {
        if (ft.sourceId != null && !existingSourceIds.has(ft.sourceId)) {
          updated.push({ ...ft, id: nextId++ })
        }
      }
      return updated
    })
  }, [autoTags])

  // Seed presetTags from auto tags on first mount if the bar is empty.
  const seededRef = useRef(false)
  useEffect(() => {
    if (seededRef.current) return
    if (autoTags == null || autoTags.length === 0) return
    if (presetTags.length > 0) {
      seededRef.current = true
      return
    }
    setPresetTags(autoTags.map((t, i) => ({ ...t, id: i })))
    seededRef.current = true
  }, [autoTags, presetTags])

  const isOverLimit = regex.length > POE_REGEX_MAX_LENGTH

  const copyRegex = (): void => {
    if (!regex) return
    navigator.clipboard.writeText(regex)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const removePresetTag = (index: number): void => {
    setPresetTags((prev) => prev.filter((_, i) => i !== index))
  }

  const findMatchingPreset = (): RegexPreset | undefined =>
    presets.find((p) => (p.generator ?? 'maps') === generator && activeHandleRef.current?.matchesPreset(p) === true)

  const addCustomTag = (): void => {
    const text = customTagInput.trim()
    if (!text) return
    if (/macro/i.test(text)) {
      const ownPreset = findMatchingPreset()
      const inUseByOther = presets.some(
        (p) => p.id !== ownPreset?.id && p.tags?.some((t) => t.text === text && (!t.source || t.source === 'custom')),
      )
      if (inUseByOther) {
        setMacroTagError('Macro tag is in use')
        setTimeout(() => setMacroTagError(null), 3000)
        return
      }
    }
    setPresetTags((prev) => [...prev, { text, color: CUSTOM_TAG_COLOR, id: Date.now() }])
    setCustomTagInput('')
  }

  const savePreset = async (): Promise<void> => {
    if (presetTags.length === 0) return
    const payload = activeHandleRef.current?.getPresetPayload() ?? {}
    const existingDupe = findMatchingPreset()
    const preset: RegexPreset = {
      id: existingDupe?.id ?? crypto.randomUUID(),
      generator,
      tags: presetTags,
      avoid: [],
      want: [],
      wantMode: 'any',
      qualifiers: {},
      nightmare: false,
      regex,
      ...payload,
    }
    const updated = await window.api.saveRegexPreset(preset)
    setPresets(updated)
    setPresetTags([])
    setCustomTagInput('')
  }

  const loadPreset = (preset: RegexPreset): void => {
    setPresetTags((preset.tags || []).map((t, i) => ({ ...t, id: Date.now() + i })))
    const targetGenerator = (preset.generator ?? 'maps') as GeneratorKey
    if (targetGenerator !== generator) _setGenerator(targetGenerator)
    // Let the target generator mount before hydrating via its ref.
    requestAnimationFrame(() => {
      const ref = targetGenerator === 'maps' ? mapsRef : customRef
      ref.current?.applyPreset(preset)
    })
  }

  const deletePreset = async (id: string): Promise<void> => {
    const updated = await window.api.deleteRegexPreset(id)
    setPresets(updated)
  }

  const clearAll = (): void => {
    activeHandleRef.current?.applyPreset({
      id: '',
      generator,
      tags: [],
      avoid: [],
      want: [],
      wantMode: 'any',
      qualifiers: {},
      nightmare: false,
      customRegex: '',
      regex: '',
    })
    setPresetTags([])
    setCustomTagInput('')
  }

  // ---- Shared chrome rendered as render-props slots the active generator composes. --
  const sharedSaveChip = (
    <FilterChip
      label={
        <>
          <Save size={12} theme="outline" fill="currentColor" /> Save
        </>
      }
      active={saveOpen}
      onClick={() => setSaveOpen((v) => !v)}
    />
  )
  const sharedLoadChip = (
    <FilterChip
      label={
        <>
          <Save size={12} theme="outline" fill="currentColor" /> Load
        </>
      }
      active={loadOpen}
      onClick={() => setLoadOpen((v) => !v)}
    />
  )
  const sharedSavePanel = (
    <div
      className="overflow-hidden transition-all duration-150"
      style={{ maxHeight: saveOpen ? 300 : 0, marginTop: saveOpen ? 8 : 0, opacity: saveOpen ? 1 : 0 }}
    >
      <div className="flex flex-col gap-2">
        <div className="setting-box" style={{ flexWrap: 'wrap', gap: 4, padding: '6px 8px' }}>
          <ReactSortable
            list={presetTags}
            setList={setPresetTags}
            animation={150}
            className="flex flex-wrap gap-1 flex-1 items-center min-w-0"
            ghostClass="opacity-30"
            filter=".no-drag"
            preventOnFilter={false}
            onStart={() => document.body.classList.add('dragging')}
            onEnd={() => document.body.classList.remove('dragging')}
          >
            {presetTags.map((tag, i) => (
              <span
                key={tag.id}
                className="flex items-center gap-[5px] px-[6px] py-[2px] rounded text-[10px] font-semibold shrink-0 cursor-grab"
                style={{ ...tagChipStyle(tag), paddingTop: 1, paddingBottom: 3 }}
              >
                <TagSourceIcon source={tag.source} size={12} />
                {tag.text}
                <CloseSmall
                  size={13}
                  theme="outline"
                  fill="currentColor"
                  className="cursor-pointer opacity-60 hover:opacity-100 -mr-[2px] ml-[1px]"
                  onClick={() => removePresetTag(i)}
                />
              </span>
            ))}
            <input
              key="input"
              type="text"
              placeholder={presetTags.length === 0 ? 'Add tags to remember what this regex does' : 'Add more tags'}
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || (e.key === ' ' && customTagInput.trim())) {
                  e.preventDefault()
                  addCustomTag()
                }
                if (e.key === 'Backspace' && !customTagInput && presetTags.length > 0) {
                  removePresetTag(presetTags.length - 1)
                }
              }}
              className="no-drag flex-1 min-w-[60px] text-[11px] bg-transparent border-none outline-none text-text"
              style={{ padding: '2px 0', marginLeft: presetTags.length > 0 ? 4 : 0 }}
            />
          </ReactSortable>
          <button
            onClick={savePreset}
            disabled={presetTags.length === 0}
            className="primary disabled:opacity-30 disabled:cursor-default shrink-0"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
  const sharedSavedPresets = loadOpen ? (
    <SavedPresets
      presets={presets}
      setPresets={setPresets}
      generator={generator}
      loadPreset={loadPreset}
      deletePreset={deletePreset}
    />
  ) : null

  const sharedProps = {
    onRegexChange: setRegex,
    onAutoTagsChange: setAutoTags,
    sharedSaveChip,
    sharedLoadChip,
    sharedSavePanel,
    sharedSavedPresets,
  }

  // Extension point: add a case here to render a new generator. Each generator owns its
  // state + regex/auto-tag computation; this container just gives it the shared chrome
  // slots and a forwardRef for preset save/load coordination.
  const renderActiveGenerator = (): JSX.Element => {
    switch (generator) {
      case 'maps':
        return <MapsGenerator ref={mapsRef} {...sharedProps} />
      case 'custom':
        return <CustomGenerator ref={customRef} {...sharedProps} />
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <ErrorBanner message={macroTagError} />

      {/* Regex output bar */}
      <div className="px-3 py-2 bg-bg-card border-b border-border">
        <div className="setting-box">
          <span className="value select-all" style={{ color: isOverLimit ? '#ef5350' : undefined }}>
            {regex || <span className="dim">Select mods to generate regex</span>}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              copyRegex()
            }}
            disabled={!regex}
            className="primary disabled:opacity-30 disabled:cursor-default"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="grid grid-cols-3 items-center mt-1">
          <div className="flex justify-start">
            <InfoChip size="sm">
              <span className="text-text-dim">{regex ? 'active' : 'empty'}</span>
            </InfoChip>
          </div>
          <div className="flex justify-center">
            <InfoChip size="sm">
              <a
                href="https://poe.re"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  window.api.openExternal('https://poe.re')
                }}
                className="flex items-center gap-1 no-underline"
              >
                <img
                  src={poereIconTight}
                  alt=""
                  className="w-[14px] h-[14px]"
                  style={{ marginTop: 1, marginLeft: -2 }}
                />
                <span className="text-text-dim">Powered by poe.re</span>
              </a>
            </InfoChip>
          </div>
          <div className="flex justify-end">
            <InfoChip size="sm" color={isOverLimit ? '#ef5350' : undefined} className="!pr-[3px]">
              <span className="flex items-center gap-1.5">
                {regex.length} / {POE_REGEX_MAX_LENGTH}
                <button
                  onClick={clearAll}
                  disabled={!regex && presetTags.length === 0}
                  className="text-[9px] font-semibold text-accent border-none rounded-full cursor-pointer px-2 py-[2px] bg-white/[0.08] disabled:opacity-30 disabled:cursor-default"
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                  }}
                >
                  Clear
                </button>
              </span>
            </InfoChip>
          </div>
        </div>
      </div>

      {/* Generator tabs */}
      <div className="flex border-b border-border bg-bg-card">
        {GENERATORS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGenerator(g.key)}
            className="flex-1 text-[11px] py-[6px] border-none cursor-pointer font-semibold rounded-none"
            style={{
              background: generator === g.key ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: generator === g.key ? '#171821' : 'var(--text-dim)',
            }}
            onMouseEnter={(e) => {
              if (generator !== g.key) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            }}
            onMouseLeave={(e) => {
              if (generator !== g.key) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {renderActiveGenerator()}
    </div>
  )
}
