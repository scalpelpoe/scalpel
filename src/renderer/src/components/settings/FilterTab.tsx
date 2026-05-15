import type { AppSettings, PoeItem } from '../../../../shared/types'
import { getGameFeatures } from '../../../../shared/game-features'
import { FilterPicker } from '../FilterPicker'
import { HistoryPanel } from '../HistoryPanel'
import { HotkeyField } from './HotkeyField'
import { SettingToggleBox } from './SettingToggleBox'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  isOverlay: boolean
  onOnlineFilterUpdated?: (name: string) => void
  onOnlineImport?: (name: string) => void
  onSettingsChange: (s: AppSettings) => void
  tryHotkey: (hotkey: string, slot: { kind: 'filter' }) => boolean
  currentItem?: PoeItem
}

export function FilterTab({
  settings,
  update,
  isOverlay,
  onOnlineFilterUpdated,
  onOnlineImport,
  onSettingsChange,
  tryHotkey,
  currentItem,
}: Props): JSX.Element {
  const features = getGameFeatures(settings.poeVersion)

  return (
    <>
      <div className="settings-section-title mt-3">Filter</div>

      {/* Filter folder & picker */}
      <section>
        <label>Filter folder</label>
        <div className="mt-[6px]">
          <FilterPicker
            settings={settings}
            onSettingsChange={onSettingsChange}
            autoSwitchInGame={isOverlay || undefined}
            onOnlineFilterUpdated={onOnlineFilterUpdated}
            onOnlineImport={onOnlineImport}
          />
        </div>
        {isOverlay && !settings.filterPath && (
          <p className="text-[11px] text-text-dim mt-1">
            Typically: <code>{features.filterFolderHint}</code>
          </p>
        )}
      </section>

      {/* Filter hotkey */}
      <section>
        <label>Filter hotkey</label>
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
        label="Automatically reload filter when switching an item's tier"
        checked={settings.reloadOnSave}
        onChange={(val) => update('reloadOnSave', val)}
      />

      <HistoryPanel item={currentItem} />
    </>
  )
}
