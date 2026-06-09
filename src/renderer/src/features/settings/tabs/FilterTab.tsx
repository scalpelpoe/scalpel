import type { AppSettings, ProfileSettingValue, PoeItem, RuntimeSettings } from '../../../../../shared/types'
import { getGameFeatures } from '../../../../../shared/game-features'
import { FilterPicker } from '../../../components/FilterPicker'
import { HistoryPanel } from '../../../components/HistoryPanel'
import { HotkeyField } from '../../../components/primitives/HotkeyField'
import { SettingToggleBox } from '../../../components/primitives/SettingToggleBox'
import { m } from '../../../../../shared/paraglide/messages.js'

interface Props {
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateProfile: <K extends 'filterPath' | 'filterDir'>(key: K, value: ProfileSettingValue<K>) => Promise<void>
  isOverlay: boolean
  onOnlineFilterUpdated?: (name: string) => void
  onOnlineImport?: (name: string) => void
  onSettingsChange: (s: RuntimeSettings) => void
  tryHotkey: (hotkey: string, slot: { kind: 'filter' }) => boolean
  currentItem?: PoeItem
}

export function FilterTab({
  settings,
  update,
  updateProfile: _updateProfile,
  isOverlay,
  onOnlineFilterUpdated,
  onOnlineImport,
  onSettingsChange,
  tryHotkey,
  currentItem,
}: Props): JSX.Element {
  const features = getGameFeatures(settings.poeVersion)
  const filterPath = settings.activeProfile?.filterPath

  // Overlay filter tab with no configured filter: show only a mandatory setup
  // panel. No filter hotkey, reload-on-save, or history panel are available
  // until a filter file is selected. Price check and other non-filter overlay
  // views should continue to work without a filter.
  if (isOverlay && !filterPath) {
    return (
      <>
        <div className="settings-section-title mt-3">{m.settings_filter_setup_title()}</div>
        <p className="text-[12px] text-text-dim mb-2">{m.settings_filter_setup_body()}</p>

        <section>
          <label>{m.settings_filter_folder()}</label>
          <div className="mt-[6px]">
            <FilterPicker
              settings={settings}
              onSettingsChange={onSettingsChange}
              autoSwitchInGame={true}
              onOnlineFilterUpdated={onOnlineFilterUpdated}
              onOnlineImport={onOnlineImport}
              mode={undefined}
            />
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      <div className="settings-section-title mt-3">{m.settings_filter_heading()}</div>

      {/* Filter folder & picker */}
      <section>
        <label>{m.settings_filter_folder()}</label>
        <div className="mt-[6px]">
          <FilterPicker
            settings={settings}
            onSettingsChange={onSettingsChange}
            autoSwitchInGame={isOverlay || undefined}
            onOnlineFilterUpdated={onOnlineFilterUpdated}
            onOnlineImport={onOnlineImport}
          />
        </div>
        {isOverlay && !filterPath && (
          <p className="text-[11px] text-text-dim mt-1">
            {m.settings_filter_folder_typically()} <code>{features.filterFolderHint}</code>
          </p>
        )}
      </section>

      {/* Filter hotkey */}
      <section>
        <label>{m.settings_filter_hotkey()}</label>
        <div className="mt-[6px]">
          <HotkeyField
            value={settings.hotkey}
            onChange={(acc) => {
              if (!tryHotkey(acc, { kind: 'filter' })) return
              update('hotkey', acc)
            }}
          />
        </div>
      </section>

      {/* Reload on save */}
      <SettingToggleBox
        label={m.settings_reload_on_save()}
        checked={settings.reloadOnSave}
        onChange={(val) => update('reloadOnSave', val)}
      />

      <HistoryPanel item={currentItem} />
    </>
  )
}
