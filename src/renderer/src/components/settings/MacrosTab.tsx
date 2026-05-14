import { useEffect, useState } from 'react'
import type { AppSettings, RegexPreset } from '../../../../shared/types'
import { Toggle } from '../Toggle'
import { RemoveButton } from '../RemoveButton'
import { HotkeyRecorder } from './HotkeyRecorder'
import { CommandInput } from './CommandInput'
import { APP_MACRO_DEFS } from './utils'
import { SettingToggleBox } from './SettingToggleBox'
import {
  chatCommandEffectiveScope,
  appMacroEffectiveScope,
  appMacroScope,
  scopeAppliesTo,
} from '../../../../shared/macro-scope'
import { narrowScopeForCrossGameConflict } from './hotkey-collisions'
import { usePoeVersion } from '../../shared/poe-version-context'

/** Extract all unique custom tag texts that contain "macro" (case-insensitive) */
function getMacroTags(presets: RegexPreset[]): string[] {
  const tags = new Set<string>()
  for (const p of presets) {
    for (const t of p.tags ?? []) {
      const isCustom = !t.source || t.source === 'custom'
      if (isCustom && /macro/i.test(t.text)) tags.add(t.text)
    }
  }
  return [...tags].sort()
}

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: { kind: 'chat'; index: number } | { kind: 'appmacro'; index: number }) => boolean
}

export function MacrosTab({ settings, update, tryHotkey }: Props): JSX.Element {
  const [presets, setPresets] = useState<RegexPreset[]>([])
  useEffect(() => {
    window.api.getRegexPresets().then(setPresets)
  }, [])
  const [pluginHotkeys, setPluginHotkeys] = useState<Array<{ id: string; label: string }>>([])
  useEffect(() => {
    void window.api.pluginListRegisteredHotkeys().then(setPluginHotkeys)
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
  const macroTags = getMacroTags(presets)
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
    .filter(({ macro }) => !macro.action.startsWith('plugin:'))
    .filter(({ macro }) => scopeAppliesTo(appMacroEffectiveScope(macro), currentGame))

  // Plugin-hotkey rows: entries in appMacros whose action begins with 'plugin:'.
  const visiblePluginMacros = (settings.appMacros ?? [])
    .map((macro, i) => ({ macro, i }))
    .filter(({ macro }) => macro.action.startsWith('plugin:'))
  const pluginIdsInUse = new Set(visiblePluginMacros.map(({ macro }) => macro.action.slice('plugin:'.length)))
  const availablePluginsForNewRow = pluginHotkeys.filter((p) => !pluginIdsInUse.has(p.id))

  return (
    <>
      {/* Chat Macros */}
      <div className="settings-section-title mt-3">Chat Macros</div>
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
                  <span className="text-[11px] text-text-dim">Submit automatically (press Enter)</span>
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
            + Add Command
          </button>
        </div>
      </section>

      {/* Plugin Hotkeys: user-managed bindings to plugin-registered hotkey
       *  actions. Each row picks a plugin from the dropdown and records its
       *  key chord. The Scalpel Macros UI pattern (dropdown + remove + add
       *  button) keeps the surface consistent with the section above. */}
      {(visiblePluginMacros.length > 0 || availablePluginsForNewRow.length > 0) && (
        <>
          <div className="settings-section-title mt-3">Plugin Hotkeys</div>
          <section>
            <div className="flex flex-col gap-2">
              {visiblePluginMacros.map(({ macro, i }) => {
                const pluginId = macro.action.slice('plugin:'.length)
                const usedElsewhere = new Set(
                  visiblePluginMacros
                    .filter(({ i: j }) => j !== i)
                    .map(({ macro: m }) => m.action.slice('plugin:'.length)),
                )
                const optionsForThisRow = pluginHotkeys.filter((p) => p.id === pluginId || !usedElsewhere.has(p.id))
                const orphan = !pluginHotkeys.some((p) => p.id === pluginId)
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
                      {orphan && <option value={macro.action}>{`${getPluginName(pluginId)} (not loaded)`}</option>}
                      {optionsForThisRow.map((p) => (
                        <option key={p.id} value={`plugin:${p.id}`}>
                          {getPluginName(p.id)}
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
                    update('appMacros', [...(settings.appMacros ?? []), { action: `plugin:${next.id}`, hotkey: '' }])
                  }}
                  className="text-[11px] text-text-dim self-start px-3 py-1.5"
                >
                  + Add Plugin Hotkey
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {/* Scalpel Macros */}
      <div className="settings-section-title mt-3">Scalpel Macros</div>
      <section>
        <div className="flex flex-col gap-2">
          {visibleAppMacros.map(({ macro, i }) => {
            const usedActions = new Set((settings.appMacros ?? []).map((m, j) => (j !== i ? m.action : '')))
            const availableActions = APP_MACRO_DEFS.filter(
              (d) =>
                scopeAppliesTo(appMacroScope(d.id), currentGame) &&
                (d.id === 'useSavedRegex' || d.id === macro.action || !usedActions.has(d.id)),
            )
            const hasTagDropdown = macro.action === 'useSavedRegex'
            const showNoTagsHint = hasTagDropdown && macroTags.length === 0
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
                    className={hasTagDropdown ? 'flex-1 min-w-0' : 'w-[200px] shrink-0'}
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
                    {availableActions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  {hasTagDropdown && (
                    <select
                      value={macro.tag ?? ''}
                      onChange={(e) => {
                        const macros = [...(settings.appMacros ?? [])]
                        macros[i] = { ...macros[i], tag: e.target.value }
                        update('appMacros', macros)
                      }}
                      className="text-[11px] flex-1 min-w-0 rounded h-[34px] box-border"
                      style={{ padding: '4px 24px 4px 8px' }}
                    >
                      <option value="">{macroTags.length === 0 ? 'No macro tags found' : 'Select a macro tag'}</option>
                      {macroTags.map((t) => (
                        <option key={t} value={t}>
                          {t}
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
                {showNoTagsHint && (
                  <div className="text-[10px] text-accent px-[2px]">
                    Add &quot;macro&quot; to a custom tag when saving a regex and it will be available to hotkey
                  </div>
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
            + Add Scalpel Macro
          </button>
        </div>
      </section>

      {/* Other Macros */}
      <div className="settings-section-title mt-3">Other Macros</div>
      <SettingToggleBox
        label="Stash tab scrolling (Ctrl + Scroll Wheel)"
        checked={settings.stashScrollEnabled ?? false}
        onChange={(val) => update('stashScrollEnabled', val)}
      />
    </>
  )
}
