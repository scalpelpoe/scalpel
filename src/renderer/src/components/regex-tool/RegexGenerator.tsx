import { useEffect, useRef, useState } from 'react'
import { Save, Plus, FSevenKey } from '@icon-park/react'
import { DismissibleTip } from '../../shared/DismissibleTip'
import { poeRegexMaxLength } from './regex-engine'
import { loadStorage, useRegexKey, ensureLegacyRegexKeysMigrated, usePersistedBool } from './mapmods-helpers'
import poereIconTight from '../../assets/other/poere-logo-tight.svg'
import { POE_RE_URL, POE2_RE_URL } from '../../../../shared/endpoints'
import { FilterChip } from '../price-check/FilterChip'
import { SavedPresetsGrid } from './SavedPresetsGrid'
import { InfoChip } from '../../shared/InfoChip'
import { MapsGenerator } from './MapsGenerator'
import { CustomGenerator } from './CustomGenerator'
import { FlaskGenerator } from './FlaskGenerator'
import { WaystonesGenerator } from './WaystonesGenerator'
import { usePoeVersion } from '../../shared/poe-version-context'
import { HotkeyField } from '../settings/HotkeyField'
import { PresetColorPicker } from './PresetColorPicker'
import type { GeneratorConfig, GeneratorHandle } from './generator-types'
import type { AppSettings, RegexPreset, RegexPresetTag, RuntimeSettings } from '../../../../shared/types'
import type { HotkeySlot } from '../settings/hotkey-collisions'

interface Props {
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
}

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

export function RegexGenerator({ settings, update, tryHotkey }: Props): JSX.Element {
  // Move legacy unsuffixed regex-tool keys into the poe1: namespace before any
  // child component reads from localStorage. Idempotent + module-flagged.
  ensureLegacyRegexKeysMigrated()
  const key = useRegexKey()
  const poeVersion = usePoeVersion()
  const maxLength = poeRegexMaxLength(poeVersion)
  const GENERATORS = poeVersion === 2 ? GENERATORS_POE2 : GENERATORS_POE1
  const defaultGenerator = GENERATORS[0].key as GeneratorKey

  const [generator, _setGenerator] = useState<GeneratorKey>(() =>
    loadStorage(key('generator'), defaultGenerator, (s) =>
      (GENERATORS as readonly GeneratorConfig[]).some((g) => g.key === s) ? (s as GeneratorKey) : defaultGenerator,
    ),
  )

  const [presetName, setPresetName] = useState('')
  const [presets, setPresets] = useState<RegexPreset[]>([])
  const [copied, setCopied] = useState(false)
  // Save/Load panels persist their open state. Save defaults open so new users discover
  // preset saving; once they collapse it (or open Load) the choice sticks across launches.
  const [saveOpen, setSaveOpen] = usePersistedBool(key('saveOpen'), true)
  const [loadOpen, setLoadOpen] = usePersistedBool(key('loadOpen'), false)
  /** Active save target. When set, Save updates this preset id instead of dedup-or-creating;
   *  null means "create new". Saves keep it set so further edits keep updating. */
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)

  // Active generator pushes its current regex and auto-tags up here.
  const [regex, setRegex] = useState('')
  const [autoTags, setAutoTags] = useState<RegexPresetTag[] | null>(null)

  const [presetColor, setPresetColor] = useState<string | undefined>(undefined)

  // Save-panel context (name/color/which preset is being edited) stashed per
  // generator so switching tabs and back doesn't forget what you were editing.
  // Session-scoped: the generator's own selections already persist to localStorage.
  const savedEditByGenerator = useRef<
    Record<string, { editingPresetId: string | null; name: string; color: string | undefined }>
  >({})

  const deriveName = (): string =>
    (autoTags ?? [])
      .map((t) => t.text)
      .join(' ')
      .trim()

  // Fallback for presets with no descriptive tags (e.g. the Custom generator):
  // give them a stable "Custom Regex N" name so they are never saved nameless.
  const nextCustomName = (): string => {
    const names = new Set(presets.map((p) => p.name))
    let n = 1
    while (names.has(`Custom Regex ${n}`)) n++
    return `Custom Regex ${n}`
  }

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
    // Stash the current generator's save-panel context, restore the target's, so
    // switching tabs preserves the name/color/preset you were editing per tab.
    savedEditByGenerator.current[generator] = { editingPresetId, name: presetName, color: presetColor }
    const restored = savedEditByGenerator.current[g]
    setPresetName(restored?.name ?? '')
    setPresetColor(restored?.color)
    setEditingPresetId(restored?.editingPresetId ?? null)
    pendingIdRef.current = null
    localStorage.setItem(key('generator'), g)
    _setGenerator(g)
  }

  useEffect(() => {
    window.api.getRegexPresets().then((loaded) => {
      setPresets(loaded)
      if (loaded.some((p) => (p.generator ?? 'maps') === generator)) setLoadOpen(true)
    })
  }, [])

  // Keep presets fresh when another window (Settings > Macros) adds, renames,
  // recolors, or deletes one. Self-originated saves update state directly.
  useEffect(() => {
    return window.api.onRegexPresetsChanged(() => {
      void window.api.getRegexPresets().then(setPresets)
    })
  }, [])

  useEffect(() => {
    window.api.reportRegex(regex)
  }, [regex])

  const isOverLimit = regex.length > maxLength

  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current)
    }
  }, [])

  const copyRegex = (): void => {
    if (!regex) return
    navigator.clipboard.writeText(regex)
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = setTimeout(() => setCopied(false), 1500)
  }

  const findMatchingPreset = (): RegexPreset | undefined =>
    presets.find((p) => (p.generator ?? 'maps') === generator && activeHandleRef.current?.matchesPreset(p) === true)

  // Bridges the sync gap between two upserts fired in the same tick (e.g. name
  // blur + color pick) so they reuse one id instead of forking two presets;
  // editingPresetId state isn't visible yet to the second synchronous caller.
  const pendingIdRef = useRef<string | null>(null)

  const upsertPreset = async (over?: Partial<RegexPreset>): Promise<string> => {
    const payload = activeHandleRef.current?.getPresetPayload() ?? {}
    const id = editingPresetId ?? pendingIdRef.current ?? findMatchingPreset()?.id ?? crypto.randomUUID()
    pendingIdRef.current = id
    const existing = presets.find((p) => p.id === id)
    const preset: RegexPreset = {
      id,
      name: presetName.trim() || deriveName() || nextCustomName(),
      color: presetColor,
      generator,
      // Auto-tags are no longer shown, but generators (Maps/Waystones) still
      // match-by-tag for save-as-update dedup, so persist them. Fall back to the
      // existing preset's tags for generators that emit none (e.g. Custom).
      tags: autoTags ?? existing?.tags,
      avoid: [],
      want: [],
      wantMode: 'any',
      qualifiers: {},
      nightmare: false,
      regex,
      ...payload,
      ...over,
    }
    const updated = await window.api.saveRegexPreset(preset)
    setPresets(updated)
    setEditingPresetId(id)
    pendingIdRef.current = null
    return id
  }

  // Hotkey bind logic
  const macros = settings.appMacros ?? []
  const macroIndex = editingPresetId
    ? macros.findIndex((m) => m.action === 'useSavedRegex' && m.presetId === editingPresetId)
    : -1
  const boundHotkey = macroIndex >= 0 ? macros[macroIndex].hotkey : ''

  const bindHotkey = async (hotkey: string): Promise<void> => {
    const slotIndex = macroIndex >= 0 ? macroIndex : macros.length
    if (!tryHotkey(hotkey, { kind: 'appmacro', index: slotIndex })) return
    const id = editingPresetId ?? (await upsertPreset())
    const next = [...macros]
    if (macroIndex >= 0) next[macroIndex] = { ...next[macroIndex], hotkey, presetId: id }
    else next.push({ action: 'useSavedRegex', hotkey, presetId: id })
    update('appMacros', next)
  }

  const unbindHotkey = (): void => {
    if (macroIndex < 0) return
    update(
      'appMacros',
      macros.filter((_, i) => i !== macroIndex),
    )
  }

  const loadPreset = (preset: RegexPreset): void => {
    setPresetName(preset.name ?? '')
    setPresetColor(preset.color)
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
    // Drop any hotkey bound to this preset so it doesn't linger as an orphaned
    // global shortcut that collides on rebind and fires nothing.
    const macros = settings.appMacros ?? []
    if (macros.some((m) => m.action === 'useSavedRegex' && m.presetId === id)) {
      update(
        'appMacros',
        macros.filter((m) => !(m.action === 'useSavedRegex' && m.presetId === id)),
      )
    }
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
    setPresetName('')
    setPresetColor(undefined)
    setEditingPresetId(null)
    pendingIdRef.current = null
  }

  // ---- Shared chrome rendered as render-props slots the active generator composes. --
  const sharedSaveChip = (
    <FilterChip
      label={
        <>
          <FSevenKey size={12} theme="outline" fill="currentColor" /> Save &amp; Bind Macro
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
  const sharedNewChip = (
    <button
      onClick={clearAll}
      className="flex items-center gap-1 px-[10px] py-1 rounded-full cursor-pointer text-[11px] font-semibold select-none text-accent"
      style={{ background: 'rgba(255,255,255,0.08)', border: '2px solid transparent' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
      }}
    >
      <Plus size={12} theme="outline" fill="currentColor" /> Start New Regex
    </button>
  )

  const sharedSavePanel = (
    <div
      className="overflow-hidden transition-all duration-150"
      style={{ maxHeight: saveOpen ? 400 : 0, marginTop: saveOpen ? 8 : 0, opacity: saveOpen ? 1 : 0 }}
    >
      <div className="flex flex-col gap-2">
        <span className="text-[9px] text-text-dim font-semibold uppercase tracking-wider">Saved Regex Name</span>
        {/* Name + color row */}
        <div className="flex gap-2 items-center">
          <input
            type="text"
            placeholder="Name (e.g. Vendor rares, High tier waystones)"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            className="flex-1 min-w-0 text-[11px] bg-black/30 rounded px-3 py-[6px] text-text outline-none"
            style={{ border: '1px solid rgba(0,0,0,0.3)' }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.5)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,0,0,0.3)'
              if (regex || presetName.trim()) void upsertPreset()
            }}
          />
          <PresetColorPicker
            value={presetColor}
            onChange={(c) => {
              setPresetColor(c)
              if (editingPresetId || regex) void upsertPreset({ color: c })
            }}
          />
        </div>

        {/* Hotkey bind row - reuses the settings HotkeyField (built-in clear). */}
        <HotkeyField
          value={boundHotkey}
          onChange={(h) => void (h ? bindHotkey(h) : unbindHotkey())}
          placeholder="Set hotkey for this regex (optional)"
        />

        <DismissibleTip id="regex-tool.macro-tag">
          Tip: Set a hotkey to paste this regex in-game, and a color to find it faster!
        </DismissibleTip>
      </div>
    </div>
  )
  const sharedSavedPresets = loadOpen ? (
    <SavedPresetsGrid
      presets={presets}
      generator={generator}
      loadPreset={loadPreset}
      deletePreset={deletePreset}
      boundHotkeyFor={(preset) =>
        (settings.appMacros ?? []).find((m) => m.action === 'useSavedRegex' && m.presetId === preset.id)?.hotkey
      }
    />
  ) : null

  const sharedProps = {
    onRegexChange: setRegex,
    onAutoTagsChange: setAutoTags,
    sharedSaveChip,
    sharedLoadChip,
    sharedNewChip,
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
      {/* Regex output bar */}
      <div className="px-3 py-2 bg-bg-card border-b border-border">
        <div className="setting-box">
          {generator === 'custom' ? (
            <input
              type="text"
              value={regex}
              onChange={(e) => {
                setRegex(e.target.value)
                activeHandleRef.current?.setRegexText?.(e.target.value)
              }}
              placeholder="Paste your custom regex here"
              spellCheck={false}
              className="value flex-1 min-w-0 bg-transparent border-none outline-none font-mono placeholder:text-text-dim"
              style={{ color: isOverLimit ? '#ef5350' : undefined }}
            />
          ) : (
            <span className="value select-all" style={{ color: isOverLimit ? '#ef5350' : undefined }}>
              {regex || <span className="dim">Select mods to generate regex</span>}
            </span>
          )}
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
                {regex.length} / {maxLength}
                <button
                  onClick={clearAll}
                  disabled={!regex}
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
