import { useEffect, useState } from 'react'
import type { AppSettings, RegexPreset, RuntimeSettings } from '../../../../../shared/types'
import { Toggle } from '../../../components/Toggle'
import { RemoveButton } from '../../../components/RemoveButton'
import { HotkeyRecorder } from '../../../components/primitives/HotkeyRecorder'
import { CommandInput } from './CommandInput'
import { APP_MACRO_DEFS } from './utils'
import { SettingToggleBox } from '../../../components/primitives/SettingToggleBox'
import { SettingSelectBox } from '../../../components/primitives/SettingSelectBox'
import {
  chatCommandEffectiveScope,
  appMacroEffectiveScope,
  appMacroScope,
  scopeAppliesTo,
} from '../../../../../shared/macro-scope'
import { narrowScopeForCrossGameConflict, type HotkeySlot } from '../../../components/primitives/hotkey-collisions'
import { usePoeVersion } from '../../../shared/poe-version-context'
import { m } from '../../../../../shared/paraglide/messages.js'

const STASH_SCROLL_MODIFIER_OPTIONS = [
  { value: 'Ctrl', label: 'Ctrl +' },
  { value: 'Shift', label: 'Shift +' },
  { value: 'Alt', label: 'Alt +' },
] as const

/** Build a sorted list of saved regex presets for the hotkey dropdown.
 *  Each entry includes the preset's name (or a fallback from tags) and its id. */
function getPresetOptions(presets: RegexPreset[]): Array<{ id: string; label: string }> {
  return presets
    .map((p) => {
      const name = p.name?.trim()
      if (name) return { id: p.id, label: name }
      const customTags = (p.tags ?? []).filter((t) => !t.source || t.source === 'custom').map((t) => t.text)
      return { id: p.id, label: customTags.slice(0, 3).join(', ') || `Preset ${p.id.slice(0, 6)}` }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** A built-in Scalpel hotkey (filter / price check) rendered in the Macros tab's
 *  Scalpel Hotkeys section. Unlike the user-added app-macro rows it shows a fixed
 *  label instead of an action dropdown and has no remove control - the binding is
 *  a top-level setting, not a list entry. Still clearable via the recorder's X. */
function FixedHotkeyRow({
  value,
  label,
  onChange,
}: {
  value: string
  label: string
  onChange: (hotkey: string) => void
}): JSX.Element {
  return (
    <div className="flex gap-[6px] items-center bg-black/15 rounded p-[5px] min-w-0">
      <HotkeyRecorder value={value} onChange={onChange} className="w-[200px] shrink-0" clearable />
      <span className="font-mono text-[11px] text-text flex-1 min-w-0 truncate px-3 rounded bg-black/30 h-[34px] box-border flex items-center">
        {label}
      </span>
    </div>
  )
}

interface Props {
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: HotkeySlot) => boolean
}

export function MacrosTab({ settings, update, tryHotkey }: Props): JSX.Element {
  const [presets, setPresets] = useState<RegexPreset[]>([])
  useEffect(() => {
    window.api.getRegexPresets().then(setPresets)
  }, [])
  useEffect(() => {
    return window.api.onRegexPresetsChanged(() => {
      void window.api.getRegexPresets().then(setPresets)
    })
  }, [])
  const [pluginHotkeys, setPluginHotkeys] = useState<Array<{ action: string; pluginId: string; label: string }>>([])
  useEffect(() => {
    void window.api.pluginListRegisteredHotkeys().then(setPluginHotkeys)
  }, [])
  useEffect(() => {
    return window.api.onPluginHotkeysChanged(() => {
      void window.api.pluginListRegisteredHotkeys().then(setPluginHotkeys)
    })
  }, [])
  // Installed plugin manifests, used to render the plugin's display name in the
  // hotkey dropdown rather than the hotkey-action label.
  const [installedPlugins, setInstalledPlugins] = useState<Array<{ id: string; name: string }>>([])
  useEffect(() => {
    void window.api
      .listInstalledPlugins()
      .then((list) => setInstalledPlugins(list.map((p) => ({ id: p.manifest.id, name: p.manifest.name }))))
  }, [])
  const getPluginName = (id: string): string => installedPlugins.find((p) => p.id === id)?.name ?? id
  const isPluginAction = (a: string): boolean => a.startsWith('plugin:') || a.startsWith('plugin-overlay:')
  const actionPluginId = (a: string): string =>
    a.startsWith('plugin-overlay:') ? a.slice('plugin-overlay:'.length) : a.slice('plugin:'.length)
  const pluginOptionLabel = (pluginId: string, label: string): string =>
    label ? `${getPluginName(pluginId)} - ${label}` : getPluginName(pluginId)
  const presetOptions = getPresetOptions(presets)
  const currentGame = usePoeVersion()

  // Build filtered chat command entries, retaining original indices for callbacks.
  // Empty-command rows always show (treated as 'both' by chatCommandEffectiveScope).
  const visibleChatCommands = (settings.chatCommands ?? [])
    .map((cmd, i) => ({ cmd, i }))
    .filter(({ cmd }) => scopeAppliesTo(chatCommandEffectiveScope(cmd), currentGame))

  // Build filtered app macro entries, retaining original indices for callbacks.
  // Plugin-prefixed actions are surfaced in their own Plugin Hotkeys section
  // below; the Scalpel Macros section only renders built-in app macros.
  const visibleAppMacros = (settings.appMacros ?? [])
    .map((macro, i) => ({ macro, i }))
    .filter(({ macro }) => !isPluginAction(macro.action))
    .filter(({ macro }) => scopeAppliesTo(appMacroEffectiveScope(macro), currentGame))

  // Plugin-hotkey rows: entries in appMacros whose action begins with 'plugin:' or 'plugin-overlay:'.
  const visiblePluginMacros = (settings.appMacros ?? [])
    .map((macro, i) => ({ macro, i }))
    .filter(({ macro }) => isPluginAction(macro.action))
  const pluginActionsInUse = new Set(visiblePluginMacros.map(({ macro }) => macro.action))
  const availablePluginsForNewRow = pluginHotkeys.filter((p) => !pluginActionsInUse.has(p.action))

  return (
    <>
      {/* Chat Macros */}
      <div className="settings-section-title mt-3">{m.settings_mac_chat_macros()}</div>
      <section>
        <div className="flex flex-col gap-2">
          {visibleChatCommands.map(({ cmd, i }) => {
            const updateCmd = (patch: Partial<typeof cmd>) => {
              const cmds = [...(settings.chatCommands ?? [])]
              cmds[i] = { ...cmds[i], ...patch }
              update('chatCommands', cmds)
            }
            return (
              <div key={i} className="flex flex-col gap-1.5 bg-black/15 rounded p-[5px]">
                <div className="flex gap-[6px] items-center">
                  <HotkeyRecorder
                    value={cmd.hotkey}
                    onChange={(hotkey) => {
                      if (!tryHotkey(hotkey, { kind: 'chat', index: i })) return
                      const scope = narrowScopeForCrossGameConflict(
                        settings,
                        hotkey,
                        { kind: 'chat', index: i },
                        currentGame,
                      )
                      updateCmd({ hotkey, scope })
                    }}
                  />
                  <CommandInput value={cmd.command} onChange={(command) => updateCmd({ command })} />
                  <RemoveButton
                    onClick={() =>
                      update(
                        'chatCommands',
                        (settings.chatCommands ?? []).filter((_, j) => j !== i),
                      )
                    }
                  />
                </div>
                <div
                  onClick={() => updateCmd({ autoSubmit: cmd.autoSubmit === false })}
                  className="flex items-center gap-[10px] cursor-pointer select-none ml-0.5"
                >
                  <Toggle checked={cmd.autoSubmit !== false} onChange={(autoSubmit) => updateCmd({ autoSubmit })} />
                  <span className="text-[11px] text-text-dim">{m.settings_mac_submit_auto()}</span>
                </div>
              </div>
            )
          })}
          <button
            onClick={() => {
              const cmds = [...(settings.chatCommands ?? []), { hotkey: '', command: '', autoSubmit: true }]
              update('chatCommands', cmds)
            }}
            className="text-[11px] text-text-dim self-start px-3 py-1.5"
          >
            {m.settings_mac_add_command()}
          </button>
        </div>
      </section>
      {/* Scalpel Hotkeys */}
      <div className="settings-section-title mt-3">{m.settings_mac_scalpel_hotkeys()}</div>
      <section>
        <div className="flex flex-col gap-2">
          <FixedHotkeyRow
            value={settings.hotkey}
            label={m.settings_filter_hotkey()}
            onChange={(hotkey) => {
              if (!tryHotkey(hotkey, { kind: 'filter' })) return
              update('hotkey', hotkey)
            }}
          />
          <FixedHotkeyRow
            value={settings.priceCheckHotkey}
            label={m.settings_pc_hotkey()}
            onChange={(hotkey) => {
              if (!tryHotkey(hotkey, { kind: 'pricecheck' })) return
              update('priceCheckHotkey', hotkey)
            }}
          />
          {visibleAppMacros.map(({ macro, i }) => {
            const usedActions = new Set((settings.appMacros ?? []).map((m, j) => (j !== i ? m.action : '')))
            const availableActions = APP_MACRO_DEFS.filter(
              (d) =>
                scopeAppliesTo(appMacroScope(d.id), currentGame) &&
                (d.id === 'useSavedRegex' || d.id === macro.action || !usedActions.has(d.id)),
            )
            const hasPresetDropdown = macro.action === 'useSavedRegex'
            const showNoPresetsHint = hasPresetDropdown && presetOptions.length === 0
            return (
              <div key={i} className="flex flex-col gap-[4px] bg-black/15 rounded p-[5px] min-w-0">
                <div className="flex gap-[6px] items-center min-w-0">
                  <HotkeyRecorder
                    value={macro.hotkey}
                    onChange={(hotkey) => {
                      if (!tryHotkey(hotkey, { kind: 'appmacro', index: i })) return
                      const scope = narrowScopeForCrossGameConflict(
                        settings,
                        hotkey,
                        { kind: 'appmacro', index: i },
                        currentGame,
                      )
                      const macros = [...(settings.appMacros ?? [])]
                      macros[i] = { ...macros[i], hotkey, scope }
                      update('appMacros', macros)
                    }}
                    className={hasPresetDropdown ? 'flex-1 min-w-0' : 'w-[200px] shrink-0'}
                  />
                  <select
                    value={macro.action}
                    onChange={(e) => {
                      const macros = [...(settings.appMacros ?? [])]
                      macros[i] = { ...macros[i], action: e.target.value, presetId: undefined, tag: undefined }
                      update('appMacros', macros)
                    }}
                    className="text-[11px] flex-1 min-w-0 rounded h-[34px] box-border"
                    style={{ padding: '4px 24px 4px 8px' }}
                  >
                    {availableActions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  {hasPresetDropdown && (
                    <select
                      value={macro.presetId ?? ''}
                      onChange={(e) => {
                        const macros = [...(settings.appMacros ?? [])]
                        macros[i] = { ...macros[i], presetId: e.target.value || undefined, tag: undefined }
                        update('appMacros', macros)
                      }}
                      className="text-[11px] flex-1 min-w-0 rounded h-[34px] box-border"
                      style={{ padding: '4px 24px 4px 8px' }}
                    >
                      <option value="">
                        {presetOptions.length === 0
                          ? m.settings_mac_no_saved_regexes()
                          : m.settings_mac_select_saved_regex()}
                      </option>
                      {presetOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <RemoveButton
                    onClick={() =>
                      update(
                        'appMacros',
                        (settings.appMacros ?? []).filter((_, j) => j !== i),
                      )
                    }
                  />
                </div>
                {showNoPresetsHint && (
                  <div className="text-[10px] text-accent px-[2px]">{m.settings_mac_no_presets_hint()}</div>
                )}
              </div>
            )
          })}
          <button
            onClick={() => {
              const used = new Set((settings.appMacros ?? []).map((m) => m.action))
              // useSavedRegex can be added multiple times; otherwise pick the first unused action
              // that applies to the current game
              const next =
                APP_MACRO_DEFS.find(
                  (d) =>
                    scopeAppliesTo(appMacroScope(d.id), currentGame) && (d.id === 'useSavedRegex' || !used.has(d.id)),
                ) ?? APP_MACRO_DEFS.find((d) => d.id === 'useSavedRegex')
              if (next) update('appMacros', [...(settings.appMacros ?? []), { action: next.id, hotkey: '' }])
            }}
            className="text-[11px] text-text-dim self-start px-3 py-1.5"
          >
            {m.settings_mac_add_scalpel_hotkey()}
          </button>
        </div>
      </section>

      {/* Plugin Hotkeys: user-managed bindings to plugin-registered hotkey
       *  actions. Each row picks a plugin from the dropdown and records its
       *  key chord. The Scalpel Macros UI pattern (dropdown + remove + add
       *  button) keeps the surface consistent with the section above. */}
      {(visiblePluginMacros.length > 0 || availablePluginsForNewRow.length > 0) && (
        <>
          <div className="settings-section-title mt-3">{m.settings_mac_plugin_hotkeys()}</div>
          <section>
            <div className="flex flex-col gap-2">
              {visiblePluginMacros.map(({ macro, i }) => {
                const pluginId =
                  pluginHotkeys.find((p) => p.action === macro.action)?.pluginId ?? actionPluginId(macro.action)
                const usedElsewhere = new Set(
                  visiblePluginMacros.filter(({ i: j }) => j !== i).map(({ macro: m }) => m.action),
                )
                const optionsForThisRow = pluginHotkeys.filter(
                  (p) => p.action === macro.action || !usedElsewhere.has(p.action),
                )
                const orphan = !pluginHotkeys.some((p) => p.action === macro.action)
                return (
                  <div key={i} className="flex gap-[6px] items-center bg-black/15 rounded p-[5px] min-w-0">
                    <HotkeyRecorder
                      value={macro.hotkey}
                      onChange={(hotkey) => {
                        if (!tryHotkey(hotkey, { kind: 'appmacro', index: i })) return
                        const macros = [...(settings.appMacros ?? [])]
                        macros[i] = { ...macros[i], hotkey }
                        update('appMacros', macros)
                      }}
                      className="w-[200px] shrink-0"
                    />
                    <select
                      value={macro.action}
                      onChange={(e) => {
                        const macros = [...(settings.appMacros ?? [])]
                        macros[i] = { ...macros[i], action: e.target.value }
                        update('appMacros', macros)
                      }}
                      className="text-[11px] flex-1 min-w-0 rounded h-[34px] box-border"
                      style={{ padding: '4px 24px 4px 8px' }}
                    >
                      {orphan && (
                        <option value={macro.action}>
                          {m.settings_mac_plugin_not_loaded({ name: getPluginName(pluginId) })}
                        </option>
                      )}
                      {optionsForThisRow.map((p) => (
                        <option key={p.action} value={p.action}>
                          {pluginOptionLabel(p.pluginId, p.label)}
                        </option>
                      ))}
                    </select>
                    <RemoveButton
                      onClick={() =>
                        update(
                          'appMacros',
                          (settings.appMacros ?? []).filter((_, j) => j !== i),
                        )
                      }
                    />
                  </div>
                )
              })}
              {availablePluginsForNewRow.length > 0 && (
                <button
                  onClick={() => {
                    const next = availablePluginsForNewRow[0]
                    if (!next) return
                    update('appMacros', [...(settings.appMacros ?? []), { action: next.action, hotkey: '' }])
                  }}
                  className="text-[11px] text-text-dim self-start px-3 py-1.5"
                >
                  {m.settings_mac_add_plugin_hotkey()}
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {/* Other Macros */}
      <div className="settings-section-title mt-3">{m.settings_mac_other_macros()}</div>
      <div className={settings.stashScrollEnabled ? 'grid grid-cols-2 gap-x-2 gap-y-[10px]' : ''}>
        <SettingToggleBox
          label={m.settings_mac_stash_scroll()}
          checked={settings.stashScrollEnabled ?? false}
          onChange={(val) => update('stashScrollEnabled', val)}
        />
        {settings.stashScrollEnabled && (
          <SettingSelectBox
            label={m.settings_mac_modifier_key()}
            value={settings.stashScrollModifier ?? 'Ctrl'}
            options={STASH_SCROLL_MODIFIER_OPTIONS}
            onChange={(v) => update('stashScrollModifier', v)}
          />
        )}
      </div>
    </>
  )
}
