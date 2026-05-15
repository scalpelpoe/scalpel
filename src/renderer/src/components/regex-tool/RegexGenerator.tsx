import { useEffect, useRef, useState } from 'react'
import { ReactSortable } from 'react-sortablejs'
import { CloseSmall, Save } from '@icon-park/react'
import { DismissibleTip } from '../../shared/DismissibleTip'
import { POE_REGEX_MAX_LENGTH } from './regex-engine'
import { TagSourceIcon, loadStorage, tagChipStyle, useRegexKey, ensureLegacyRegexKeysMigrated } from './mapmods-helpers'
import poereIconTight from '../../assets/other/poere-logo-tight.svg'
import { POE_RE_URL, POE2_RE_URL } from '../../../../shared/endpoints'
import { FilterChip } from '../price-check/FilterChip'
import { ErrorBanner } from '../ErrorBanner'
import { SavedPresets } from './SavedPresets'
import { InfoChip } from '../../shared/InfoChip'
import { CUSTOM_TAG_COLOR } from './preset-tags'
import { MapsGenerator } from './MapsGenerator'
import { CustomGenerator } from './CustomGenerator'
import { FlaskGenerator } from './FlaskGenerator'
import { WaystonesGenerator } from './WaystonesGenerator'
import { usePoeVersion } from '../../shared/poe-version-context'
import type { GeneratorConfig, GeneratorHandle } from './generator-types'
import type { RegexPreset, RegexPresetTag } from '../../../../shared/types'

/** Registered regex generators. Adding a new one (e.g. vendor regex) is:
 *    1. Create a component matching the `GeneratorHandle` / `GeneratorProps` shape
 *    2. Add an entry to the per-version list it should appear in
 *    3. Add a case in the component-switch below (see `renderActiveGenerator`)
 *  The registry drives the tab strip, localStorage key, and preset scoping.
 *  Generator availability is per-game: PoE1 uses Maps + Flasks + Custom;
 *  PoE2 uses Waystones + Custom (no flasks UI yet, no PoE1 maps). */
const GENERATORS_POE1 = [
  { key: 'maps', label: 'Maps' },
  { key: 'flasks', label: 'Flasks' },
  { key: 'custom', label: 'Custom' },
] as const satisfies readonly GeneratorConfig[]

const GENERATORS_POE2 = [
  { key: 'waystones', label: 'Waystones' },
  { key: 'custom', label: 'Custom' },
] as const satisfies readonly GeneratorConfig[]

type GeneratorKey = 'maps' | 'flasks' | 'waystones' | 'custom'

export function RegexGenerator(): JSX.Element {
  // Move legacy unsuffixed regex-tool keys into the poe1: namespace before any
  // child component reads from localStorage. Idempotent + module-flagged.
  ensureLegacyRegexKeysMigrated()
  const key = useRegexKey()
  const poeVersion = usePoeVersion()
  const GENERATORS = poeVersion === 2 ? GENERATORS_POE2 : GENERATORS_POE1
  const defaultGenerator = GENERATORS[0].key as GeneratorKey

  const [generator, _setGenerator] = useState<GeneratorKey>(() =>
    loadStorage(key('generator'), defaultGenerator, (s) =>
      (GENERATORS as readonly GeneratorConfig[]).some((g) => g.key === s) ? (s as GeneratorKey) : defaultGenerator,
    ),
  )

  // Preset-bar tags stored per generator so switching tabs preserves in-progress saves.
  const savedTagsByGenerator = useRef<Record<string, (RegexPresetTag & { id: number })[]>>(
    (() => {
      const byGen = loadStorage(key('presetTagsByGenerator'), {} as Record<string, (RegexPresetTag & { id: number })[]>)
      // Migrate legacy flat-array key on first run. Reuses the `generator` state
      // (populated above on the same render) rather than re-running the same
      // loadStorage lookup.
      if (Object.keys(byGen).length === 0) {
        const legacy = loadStorage<(RegexPresetTag & { id: number })[]>(key('presetTags'), [])
        if (legacy.length > 0) byGen[generator] = legacy
      }
      return byGen
    })(),
  )
  const [presetTags, setPresetTags] = useState<(RegexPresetTag & { id: number })[]>(
    () => savedTagsByGenerator.current[generator] ?? [],
  )
  useEffect(() => {
    savedTagsByGenerator.current[generator] = presetTags
    localStorage.setItem(key('presetTagsByGenerator'), JSON.stringify(savedTagsByGenerator.current))
  }, [presetTags, generator, key])

  const [customTagInput, setCustomTagInput] = useState('')
  const [presets, setPresets] = useState<RegexPreset[]>([])
  const [copied, setCopied] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [loadOpen, setLoadOpen] = useState(false)
  const [macroTagError, setMacroTagError] = useState<string | null>(null)
  /** Active save target. When set, Save updates this preset id instead of dedup-or-creating;
   *  null means "create new". Saves keep it set so further edits keep updating. */
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)

  // Active generator pushes its current regex and auto-tags up here.
  const [regex, setRegex] = useState('')
  const [autoTags, setAutoTags] = useState<RegexPresetTag[] | null>(null)

  const mapsRef = useRef<GeneratorHandle>(null)
  const flasksRef = useRef<GeneratorHandle>(null)
  const customRef = useRef<GeneratorHandle>(null)
  const waystonesRef = useRef<GeneratorHandle>(null)
  const refForGenerator = (g: GeneratorKey): React.RefObject<GeneratorHandle> => {
    switch (g) {
      case 'maps':
        return mapsRef
      case 'flasks':
        return flasksRef
      case 'waystones':
        return waystonesRef
      case 'custom':
        return customRef
    }
  }
  const activeHandleRef = refForGenerator(generator)

  const setGenerator = (g: GeneratorKey): void => {
    // Stash current tags, restore target's.
    savedTagsByGenerator.current[generator] = presetTags
    localStorage.setItem(key('presetTagsByGenerator'), JSON.stringify(savedTagsByGenerator.current))
    setPresetTags(savedTagsByGenerator.current[g] ?? [])
    setCustomTagInput('')
    setSaveOpen(false)
    // Editing context belongs to one generator; switching tabs starts fresh so a stray
    // Update doesn't overwrite a preset that lives on a different generator.
    setEditingPresetId(null)
    localStorage.setItem(key('generator'), g)
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

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const macroErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
      if (macroErrorTimer.current) clearTimeout(macroErrorTimer.current)
    }
  }, [])

  const copyRegex = (): void => {
    if (!regex) return
    navigator.clipboard.writeText(regex)
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 1500)
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
        if (macroErrorTimer.current) clearTimeout(macroErrorTimer.current)
        macroErrorTimer.current = setTimeout(() => setMacroTagError(null), 3000)
        return
      }
    }
    setPresetTags((prev) => [...prev, { text, color: CUSTOM_TAG_COLOR, id: Date.now() }])
    setCustomTagInput('')
  }

  const savePreset = async (): Promise<void> => {
    if (presetTags.length === 0) return
    const payload = activeHandleRef.current?.getPresetPayload() ?? {}
    const id = editingPresetId ?? findMatchingPreset()?.id ?? crypto.randomUUID()
    const preset: RegexPreset = {
      id,
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
    // Stay in edit mode for this preset so further tweaks keep updating instead of forking.
    setEditingPresetId(id)
    setCustomTagInput('')
  }

  const loadPreset = (preset: RegexPreset): void => {
    setPresetTags((preset.tags || []).map((t, i) => ({ ...t, id: Date.now() + i })))
    setEditingPresetId(preset.id)
    const targetGenerator = (preset.generator ?? defaultGenerator) as GeneratorKey
    if (targetGenerator !== generator) _setGenerator(targetGenerator)
    // Let the target generator mount before hydrating via its ref.
    requestAnimationFrame(() => {
      refForGenerator(targetGenerator).current?.applyPreset(preset)
    })
  }

  const deletePreset = async (id: string): Promise<void> => {
    const updated = await window.api.deleteRegexPreset(id)
    setPresets(updated)
    if (id === editingPresetId) setEditingPresetId(null)
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
    setEditingPresetId(null)
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
            {editingPresetId ? 'Update' : 'Save'}
          </button>
        </div>
        <DismissibleTip id="regex-tool.macro-tag">
          Tip: Add &quot;macro&quot; to any custom tag to set a hotkey for it in settings
        </DismissibleTip>
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
      case 'flasks':
        return <FlaskGenerator ref={flasksRef} {...sharedProps} />
      case 'waystones':
        return <WaystonesGenerator ref={waystonesRef} {...sharedProps} />
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
              {(() => {
                const url = poeVersion === 2 ? POE2_RE_URL : POE_RE_URL
                const label = poeVersion === 2 ? 'Powered by poe2.re' : 'Powered by poe.re'
                return (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.preventDefault()
                      window.api.openExternal(url)
                    }}
                    className="flex items-center gap-1 no-underline"
                  >
                    <img
                      src={poereIconTight}
                      alt=""
                      className="w-[14px] h-[14px]"
                      style={{ marginTop: 1, marginLeft: -2 }}
                    />
                    <span className="text-text-dim">{label}</span>
                  </a>
                )
              })()}
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
