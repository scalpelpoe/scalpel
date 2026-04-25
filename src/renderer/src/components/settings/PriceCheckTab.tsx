import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../../shared/types'
import { PoeLoginButton } from './PoeLoginButton'
import { Toggle } from '../Toggle'
import { keyEventToAccelerator, prettyHotkey } from './utils'
import {
  LISTED_TIME_OPTIONS,
  PRICE_OPTIONS,
  RESULTS_VIEW_OPTIONS,
  STATUS_OPTIONS,
} from '../price-check/search-settings'
import { SettingSelectBox } from './SettingSelectBox'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  tryHotkey: (hotkey: string, slot: { kind: 'pricecheck' }) => boolean
}

export function PriceCheckTab({ settings, update, tryHotkey }: Props): JSX.Element {
  const [recording, setRecording] = useState(false)
  const recRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!recording) return
    window.api.suspendHotkeys()
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const acc = keyEventToAccelerator(e)
      if (!acc) return
      if (!tryHotkey(acc, { kind: 'pricecheck' })) {
        setRecording(false)
        return
      }
      update('priceCheckHotkey', acc)
      setRecording(false)
    }
    const onClick = (e: MouseEvent): void => {
      if (recRef.current && !recRef.current.contains(e.target as Node)) setRecording(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
      window.api.resumeHotkeys()
    }
  }, [recording, update, tryHotkey])

  return (
    <>
      {/* Group the two top rows tighter than the outer section gap, matching Defaults. */}
      <div className="flex flex-col gap-[10px]">
        <section>
          <label>Price check hotkey</label>
          <div ref={recRef} className="mt-[2px]">
            <div className="setting-box" onClick={() => setRecording(true)}>
              <span className={`value ${recording ? 'recording' : ''}`}>
                {recording
                  ? 'Press your desired key combo...'
                  : prettyHotkey(settings.priceCheckHotkey) || '(none set)'}
              </span>
              {!recording && (
                <button
                  className="primary"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRecording(true)
                  }}
                >
                  Change
                </button>
              )}
            </div>
          </div>
        </section>

        <section>
          <label>Trade site login</label>
          <div className="mt-[2px]">
            <PoeLoginButton />
          </div>
        </section>
      </div>

      <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">Defaults</div>

      {/* Group the defaults so they pack tighter than the outer section gap. */}
      <div className="flex flex-col gap-[10px]">
        <SettingSelectBox
          label="Trade listings"
          value={settings.tradeStatus ?? 'any'}
          options={STATUS_OPTIONS}
          onChange={(v) => update('tradeStatus', v)}
        />
        <SettingSelectBox
          label="Buyout currency"
          value={settings.tradePriceOption ?? 'chaos_divine'}
          options={PRICE_OPTIONS}
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
        <section>
          <label>Default search percentage</label>
          <div className="flex items-center gap-[10px] mt-[2px]">
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={settings.priceCheckDefaultPercent ?? 90}
              onChange={(e) => update('priceCheckDefaultPercent', parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="text-[13px] font-semibold text-text min-w-[36px] text-right">
              {settings.priceCheckDefaultPercent ?? 90}%
            </span>
          </div>
        </section>
      </div>

      <div className="text-[10px] text-accent tracking-[1.5px] uppercase mt-3 font-bold">Additional Settings</div>

      <section>
        <div
          onClick={() => update('tradeDefaultToBase', !settings.tradeDefaultToBase)}
          className="flex items-center gap-[10px] cursor-pointer select-none"
        >
          <Toggle
            checked={settings.tradeDefaultToBase ?? false}
            onChange={(val) => update('tradeDefaultToBase', val)}
          />
          <span className="text-xs text-text">
            Default all items to &quot;Base&quot; - can simplify unchecking unwanted mods
          </span>
        </div>
      </section>

      <section>
        <div
          onClick={() => update('tradeKeepUncheckedVisible', !settings.tradeKeepUncheckedVisible)}
          className="flex items-center gap-[10px] cursor-pointer select-none"
        >
          <Toggle
            checked={settings.tradeKeepUncheckedVisible ?? false}
            onChange={(val) => update('tradeKeepUncheckedVisible', val)}
          />
          <span className="text-xs text-text">Don&apos;t hide mods I uncheck</span>
        </div>
      </section>

      <section>
        <div
          onClick={() => update('tradeNeverAutoSearch', !settings.tradeNeverAutoSearch)}
          className="flex items-center gap-[10px] cursor-pointer select-none"
        >
          <Toggle
            checked={settings.tradeNeverAutoSearch ?? false}
            onChange={(val) => update('tradeNeverAutoSearch', val)}
          />
          <span className="text-xs text-text">Never auto-search</span>
        </div>
      </section>
    </>
  )
}
