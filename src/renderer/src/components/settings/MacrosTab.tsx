import { useEffect, useState } from 'react'
import type { AppSettings, RegexPreset } from '../../../../shared/types'
import { Toggle } from '../Toggle'
import { RemoveButton } from '../RemoveButton'
import { HotkeyRecorder } from './HotkeyRecorder'
import { CommandInput } from './CommandInput'
import { APP_MACRO_DEFS } from './utils'

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
  const macroTags = getMacroTags(presets)

  return (
    <>
      {/* Chat Macros */}
      <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">Chat Macros</div>
      <section>
        <div className="flex flex-col gap-2">
          {(settings.chatCommands ?? []).map((cmd, i) => {
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
                      updateCmd({ hotkey })
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

      {/* Other Macros */}
      <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">Other Macros</div>
      <section>
        <div
          onClick={() => update('stashScrollEnabled', !settings.stashScrollEnabled)}
          className="flex items-center gap-[10px] cursor-pointer select-none"
        >
          <Toggle
            checked={settings.stashScrollEnabled ?? false}
            onChange={(val) => update('stashScrollEnabled', val)}
          />
          <span className="text-xs text-text">Stash tab scrolling (Ctrl + Scroll Wheel)</span>
        </div>
      </section>

      {/* App Macros */}
      <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">App Macros</div>
      <section>
        <div className="flex flex-col gap-2">
          {(settings.appMacros ?? []).map((macro, i) => {
            const usedActions = new Set((settings.appMacros ?? []).map((m, j) => (j !== i ? m.action : '')))
            const availableActions = APP_MACRO_DEFS.filter(
              (d) => d.id === 'useSavedRegex' || d.id === macro.action || !usedActions.has(d.id),
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
                      const macros = [...(settings.appMacros ?? [])]
                      macros[i] = { ...macros[i], hotkey }
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
              const next =
                APP_MACRO_DEFS.find((d) => d.id === 'useSavedRegex' || !used.has(d.id)) ??
                APP_MACRO_DEFS.find((d) => d.id === 'useSavedRegex')
              if (next) update('appMacros', [...(settings.appMacros ?? []), { action: next.id, hotkey: '' }])
            }}
            className="text-[11px] text-text-dim self-start px-3 py-1.5"
          >
            + Add App Macro
          </button>
        </div>
      </section>
    </>
  )
}
