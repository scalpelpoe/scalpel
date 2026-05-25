import type { AppSettings } from '../../../../shared/types'
import { PoeLoginButton } from './PoeLoginButton'
import { HotkeyField } from './HotkeyField'
import {
  ADAPTIVE_MODE_OPTIONS,
  LISTED_TIME_OPTIONS,
  getPriceOptions,
  RESULTS_VIEW_OPTIONS,
  STATUS_OPTIONS,
} from '../price-check/search-settings'
import { SettingSelectBox } from './SettingSelectBox'
import { SettingToggleBox } from './SettingToggleBox'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: { kind: 'pricecheck' }) => boolean
}

export function PriceCheckTab({ settings, update, tryHotkey }: Props): JSX.Element {
  return (
    <>
      <div className="settings-section-title mt-3">Trade Settings</div>
      {/* Group the two top rows tighter than the outer section gap, matching Defaults. */}
      <div className="flex flex-col gap-[10px]">
        <section>
          <label>Price check hotkey</label>
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
          <label>Trade site login</label>
          <div className="mt-[2px]">
            <PoeLoginButton />
          </div>
        </section>
      </div>

      <div className="settings-section-title mt-3">Defaults</div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-[10px]">
        <SettingSelectBox
          label="Trade listings"
          value={settings.tradeStatus ?? 'available'}
          options={STATUS_OPTIONS}
          onChange={(v) => update('tradeStatus', v)}
        />
        <SettingSelectBox
          label="Buyout currency"
          value={settings.tradePriceOption ?? (settings.poeVersion === 2 ? 'exalted_divine' : 'chaos_divine')}
          options={getPriceOptions(settings.poeVersion ?? 1)}
          onChange={(v) => update('tradePriceOption', v)}
        />
        <SettingSelectBox
          label="Listing time"
          value={settings.tradeDefaultListedTime ?? ''}
          options={LISTED_TIME_OPTIONS}
          onChange={(v) => update('tradeDefaultListedTime', v)}
        />
        <SettingSelectBox
          label="Trade Results View"
          value={settings.tradeResultsView ?? 'default'}
          options={RESULTS_VIEW_OPTIONS}
          onChange={(v) => update('tradeResultsView', v)}
        />
        <SettingToggleBox
          label="Collapse Listings by Account"
          checked={settings.tradeCollapseListings ?? true}
          onChange={(val) => update('tradeCollapseListings', val)}
        />
        <section>
          <label>Default search percentage</label>
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
          label="Adaptive defaults"
          value={settings.adaptiveDefaultsMode ?? 'eager'}
          options={ADAPTIVE_MODE_OPTIONS}
          onChange={(v) => update('adaptiveDefaultsMode', v)}
        />
        {import.meta.env.DEV && (
          <section>
            <label>Reset learned preferences (dev)</label>
            <div className="setting-box mt-[2px] min-h-[40px] flex items-center">
              <button
                type="button"
                className="text-[13px] font-semibold text-text px-[10px] py-[4px] rounded-[4px] bg-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.16)]"
                onClick={() => void window.api.resetLearning('all')}
              >
                Reset everything
              </button>
            </div>
          </section>
        )}
      </div>

      <div className="settings-section-title mt-3">Additional Settings</div>

      {/* Tighten the toggle group; outer fragment gap is for top-level sections, too sparse for stacked rows. */}
      <div className="flex flex-col gap-[10px]">
        <SettingToggleBox
          label='Default all items to "Base" - can simplify unchecking unwanted mods'
          checked={settings.tradeDefaultToBase ?? false}
          onChange={(val) => update('tradeDefaultToBase', val)}
        />
        <SettingToggleBox
          label="Don't hide mods I uncheck"
          checked={settings.tradeKeepUncheckedVisible ?? false}
          onChange={(val) => update('tradeKeepUncheckedVisible', val)}
        />
        <SettingToggleBox
          label="Never auto-search"
          checked={settings.tradeNeverAutoSearch ?? false}
          onChange={(val) => update('tradeNeverAutoSearch', val)}
        />
      </div>
    </>
  )
}
