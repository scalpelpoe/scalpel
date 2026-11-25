import { useCallback, useEffect, useState } from 'react'
import {
  findPlatformSetting,
  type PlatformSettingDescriptor,
  type PlatformSettingOption,
} from '@shared/contracts/platform-settings'
import { SettingSelectBox } from '@renderer/components/primitives/SettingSelectBox'
import { TextInput } from '@renderer/components/primitives/TextInput'
import type { AppSettings } from '@shared/types'
import { platformMessage, resolvePlatformParams } from '@renderer/shared/platform-messages'
import { PlatformSettingNoticeView } from '@renderer/shared/platform-notices'
import { refreshPlatformSettings, usePlatformSettings } from '@renderer/shared/platform-settings-store'

interface Props {
  settings: Pick<AppSettings, 'gameTitlePoe1' | 'gameTitlePoe2'>
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onError?: (message: string, tone?: 'error' | 'warn') => void
}

function optionLabel(valueLabelKey: string | undefined, option: PlatformSettingOption): string {
  if (!option.effectiveLabelKey || !valueLabelKey) return platformMessage(option.labelKey)
  return platformMessage(valueLabelKey, {
    label: platformMessage(option.labelKey),
    value: platformMessage(option.effectiveLabelKey),
  })
}

/** Generic renderer for the descriptor view owned by `@scalpel/platform`.
 *  Banners live at the top of the window; this tab only renders settings and
 *  writes opaque ids. */
export function PlatformTab({ settings, update, onError }: Props): JSX.Element {
  const payload = usePlatformSettings()
  const view = payload?.view
  const recentTitles = payload?.recentWindowTitles ?? []
  const [copiedHint, setCopiedHint] = useState<string | null>(null)

  const copyHint = useCallback(async (hint: string) => {
    try {
      await navigator.clipboard.writeText(hint)
      setCopiedHint(hint)
    } catch {
      // Clipboard access can be denied; the text stays selectable regardless.
    }
  }, [])

  useEffect(() => {
    if (!copiedHint) return
    const timer = setTimeout(() => setCopiedHint(null), 1200)
    return () => clearTimeout(timer)
  }, [copiedHint])

  // The shared settings store refreshes every 5s for banners; while this tab is
  // open, refresh faster so the activated-title readout follows app switches.
  useEffect(() => {
    const timer = setInterval(() => void refreshPlatformSettings(), 1000)
    return () => clearInterval(timer)
  }, [])

  const write = useCallback(
    async (id: string, value: string, errorKey?: string) => {
      if (!view) return
      const descriptor = findPlatformSetting(view, id)
      // Do not guard on `descriptor.value`: the view can be one IPC refresh
      // behind a quick second selection, which would drop a revert and leave a
      // stale restart banner behind. The write is idempotent in the store.
      if (!descriptor || descriptor.availability !== 'available') return
      try {
        await window.api.setPlatformSetting(id, value)
        await refreshPlatformSettings()
      } catch {
        onError?.(platformMessage(errorKey ?? 'settings_platform_error'))
      }
    },
    [view, onError],
  )

  const commitTitle = (key: 'gameTitlePoe1' | 'gameTitlePoe2', value: string): void => {
    const normalized = value.trim()
    if ((settings[key] ?? '') !== normalized) update(key, normalized)
  }

  if (!view?.available) return <></>

  const valueLabelKey = view.optionValueLabelKey

  const renderSetting = (setting: PlatformSettingDescriptor): JSX.Element => {
    const options = setting.options.length
      ? setting.options.map((option) => ({ value: option.id, label: optionLabel(valueLabelKey, option) }))
      : [{ value: setting.value, label: platformMessage(setting.hintKey ?? 'settings_platform_error') }]

    return (
      <div className="mt-3" key={setting.id}>
        <SettingSelectBox
          labelClassName="settings-section-title"
          label={platformMessage(setting.labelKey)}
          value={setting.value}
          options={options}
          disabled={setting.availability !== 'available'}
          onChange={(value) => void write(setting.id, value, setting.errorKey)}
        />
        {setting.hintKey && (
          <p className="text-[10px] text-text-dim mt-1">
            {platformMessage(setting.hintKey, resolvePlatformParams(setting.hintParams))}
          </p>
        )}
        {setting.notices?.map((notice, index) => (
          <PlatformSettingNoticeView compact key={`${setting.id}:${index}`} notice={notice} />
        ))}
      </div>
    )
  }

  const gameTitleInput = (
    <div className="mt-3">
      <h4 className="settings-section-title">{platformMessage('settings_linux_game_titles_heading')}</h4>
      <p className="text-[10px] text-text-dim mt-1">{platformMessage('settings_linux_game_titles_hint')}</p>
      <div className="mt-2 rounded border border-border bg-bg-card px-2 py-1.5">
        <div className="text-[10px] text-text-dim mb-1">{platformMessage('settings_linux_recent_titles')}</div>
        {recentTitles.length ? (
          recentTitles.map((title, index) => (
            <div key={`${index}:${title}`} className="flex items-start gap-2 py-0.5">
              <code className="min-w-0 flex-1 break-all font-mono text-[11px] font-semibold text-accent">
                <span className="text-text-dim">
                  {index === 0
                    ? platformMessage('settings_linux_recent_titles_current')
                    : platformMessage('settings_linux_recent_titles_previous')}
                  :{' '}
                </span>
                <span>{title}</span>
              </code>
              <button
                type="button"
                aria-label={`${platformMessage('settings_linux_recent_titles_copy')}: ${title}`}
                className="shrink-0 text-[10px] text-accent underline"
                onClick={() => void copyHint(title)}
              >
                {copiedHint === title
                  ? platformMessage('settings_linux_recent_titles_copied')
                  : platformMessage('settings_linux_recent_titles_copy')}
              </button>
            </div>
          ))
        ) : (
          <div className="text-[10px] text-text-dim">{platformMessage('settings_linux_recent_titles_empty')}</div>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {(
          [
            ['gameTitlePoe1', 'settings_linux_game_title_poe1', 'platform-game-title-poe1'],
            ['gameTitlePoe2', 'settings_linux_game_title_poe2', 'platform-game-title-poe2'],
          ] as const
        ).map(([titleKey, labelKey, id]) => (
          <div key={titleKey}>
            <label className="text-xs" htmlFor={id}>
              {platformMessage(labelKey)}
            </label>
            <TextInput
              id={id}
              fullWidth
              key={`${titleKey}:${settings[titleKey] ?? ''}`}
              defaultValue={settings[titleKey] ?? ''}
              placeholder={platformMessage('settings_linux_game_title_auto')}
              onBlur={(event) => commitTitle(titleKey, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <>
      {view.sections.map((section) => {
        const label = section.labelKey ? platformMessage(section.labelKey) : null
        const settings = section.settings.map(renderSetting)
        if (!section.collapsed) return <div key={section.id}>{settings}</div>
        return (
          <details className="mt-3" key={section.id}>
            <summary className="settings-section-title cursor-pointer">{label}</summary>
            {settings}
            {section.id === 'advanced' ? gameTitleInput : null}
          </details>
        )
      })}
    </>
  )
}
