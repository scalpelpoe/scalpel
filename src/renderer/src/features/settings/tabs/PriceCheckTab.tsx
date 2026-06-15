import type { AppSettings, ProfileSettingValue, RuntimeSettings } from '@shared/types'
import { PoeLoginButton } from './PoeLoginButton'
import { HotkeyField } from '@renderer/components/primitives/HotkeyField'
import {
  ADAPTIVE_MODE_OPTIONS,
  LISTED_TIME_OPTIONS,
  getPriceOptions,
  RESULTS_VIEW_OPTIONS,
  STATUS_OPTIONS,
} from '@renderer/shared/trade-settings'
import { SettingSelectBox } from '@renderer/components/primitives/SettingSelectBox'
import { SettingToggleBox } from '@renderer/components/primitives/SettingToggleBox'
import { m } from '@shared/paraglide/messages.js'

interface Props {
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateProfile: <K extends 'tradePriceOption'>(key: K, value: ProfileSettingValue<K>) => Promise<void>
  tryHotkey: (hotkey: string, slot: { kind: 'pricecheck' }) => boolean
}

export function PriceCheckTab({ settings, update, updateProfile, tryHotkey }: Props): JSX.Element {
  return (
    <>
      <div className="settings-section-title mt-3">{m.settings_pc_trade_settings()}</div>
      {/* Group the two top rows tighter than the outer section gap, matching Defaults. */}
      <div className="flex flex-col gap-[10px]">
        <section>
          <label>{m.settings_pc_hotkey()}</label>
          <div className="mt-[2px]">
            <HotkeyField
              value={settings.priceCheckHotkey}
              onChange={(acc) => {
                if (!tryHotkey(acc, { kind: 'pricecheck' })) return
                update('priceCheckHotkey', acc)
              }}
            />
          </div>
        </section>

        <section>
          <label>{m.settings_pc_trade_login()}</label>
          <div className="mt-[2px]">
            <PoeLoginButton />
          </div>
        </section>
      </div>

      <div className="settings-section-title mt-3">{m.settings_pc_defaults()}</div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-[10px]">
        <SettingSelectBox
          label={m.settings_pc_trade_listings()}
          value={settings.tradeStatus ?? 'available'}
          options={STATUS_OPTIONS}
          onChange={(v) => update('tradeStatus', v)}
        />
        <SettingSelectBox
          label={m.settings_pc_buyout_currency()}
          value={
            settings.activeProfile?.tradePriceOption ?? (settings.poeVersion === 2 ? 'exalted_divine' : 'chaos_divine')
          }
          options={getPriceOptions(settings.poeVersion ?? 1)}
          onChange={(v) => updateProfile('tradePriceOption', v)}
        />
        <SettingSelectBox
          label={m.settings_pc_listing_time()}
          value={settings.tradeDefaultListedTime ?? ''}
          options={LISTED_TIME_OPTIONS}
          onChange={(v) => update('tradeDefaultListedTime', v)}
        />
        <SettingSelectBox
          label={m.settings_pc_results_view()}
          value={settings.tradeResultsView ?? 'default'}
          options={RESULTS_VIEW_OPTIONS}
          onChange={(v) => update('tradeResultsView', v)}
        />
        <SettingToggleBox
          label={m.settings_pc_collapse_listings()}
          checked={settings.tradeCollapseListings ?? true}
          onChange={(val) => update('tradeCollapseListings', val)}
        />
        <section>
          <label>{m.settings_pc_default_percent()}</label>
          <div className="setting-box mt-[2px] min-h-[40px] flex items-center gap-[10px]">
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={settings.priceCheckDefaultPercent ?? 90}
              onChange={(e) => update('priceCheckDefaultPercent', parseInt(e.target.value, 10))}
              className="flex-1"
            />
            <span className="text-[13px] font-semibold text-text min-w-[36px] text-right">
              {settings.priceCheckDefaultPercent ?? 90}%
            </span>
          </div>
        </section>
        <SettingSelectBox
          label={m.settings_pc_adaptive_defaults()}
          value={settings.adaptiveDefaultsMode ?? 'eager'}
          options={ADAPTIVE_MODE_OPTIONS}
          onChange={(v) => update('adaptiveDefaultsMode', v)}
        />
      </div>

      <div className="settings-section-title mt-3">{m.settings_pc_additional()}</div>

      {/* Tighten the toggle group; outer fragment gap is for top-level sections, too sparse for stacked rows. */}
      <div className="flex flex-col gap-[10px]">
        <SettingToggleBox
          label={m.settings_pc_default_base()}
          checked={settings.tradeDefaultToBase ?? false}
          onChange={(val) => update('tradeDefaultToBase', val)}
        />
        <SettingToggleBox
          label={m.settings_pc_crafting_ready()}
          checked={settings.tradePoe2CraftingReadyDefault ?? true}
          onChange={(val) => update('tradePoe2CraftingReadyDefault', val)}
        />
        <SettingToggleBox
          label={m.settings_pc_keep_unchecked()}
          checked={settings.tradeKeepUncheckedVisible ?? false}
          onChange={(val) => update('tradeKeepUncheckedVisible', val)}
        />
        <SettingToggleBox
          label={m.settings_pc_never_autosearch()}
          checked={settings.tradeNeverAutoSearch ?? false}
          onChange={(val) => update('tradeNeverAutoSearch', val)}
        />
      </div>
    </>
  )
}
