import { useState } from 'react'
import type { AppSettings } from '../../../../shared/types'
import { Toggle } from '../Toggle'
import { ScrubInput } from '../regex-tool/ScrubInput'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

const SCALE_PRESETS = [0.75, 1, 1.25, 1.5, 2] as const

export function GeneralTab({ settings, update }: Props): JSX.Element {
  // Custom scale mode is auto-enabled when the saved scale isn't one of the presets,
  // and toggled by the Custom/preset buttons otherwise.
  const [customScale, setCustomScale] = useState<boolean>(
    !(SCALE_PRESETS as readonly number[]).includes(settings.overlayScale),
  )

  return (
    <>
      {/* League */}
      <section>
        <label>League</label>
        <div className="setting-box mt-[6px] relative">
          <span className="value">{settings.league}</span>
          <button
            className="primary"
            onClick={() => {
              const sel = document.getElementById('league-select-unified') as HTMLSelectElement | null
              sel?.showPicker?.()
              sel?.focus()
            }}
          >
            Change
          </button>
          <select
            id="league-select-unified"
            value={settings.league}
            onChange={(e) => update('league', e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          >
            {['Mirage', 'Hardcore Mirage', 'Standard', 'Hardcore'].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* PoE version switcher in case we can't automate */}
      {import.meta.env.DEV && (
        <section>
          <label>Game version: Debug</label>
          <p className="text-[10px] text-text-dim mt-0.5 mb-1.5">Restart required after changing</p>
          <div className="flex gap-1.5">
            {([1, 2] as const).map((v) => (
              <button
                key={v}
                onClick={() => update('poeVersion', v)}
                className={`text-[11px] px-3 py-1.5 ${
                  settings.poeVersion === v ? 'bg-accent text-bg-solid' : 'text-text-dim'
                }`}
              >
                Path of Exile{v === 2 ? ' 2' : ''}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Overlay scale */}
      <section>
        <label>Overlay scale</label>
        <div className="flex items-center gap-1.5 mt-[6px]">
          {SCALE_PRESETS.map((scale) => (
            <button
              key={scale}
              onClick={() => {
                setCustomScale(false)
                update('overlayScale', scale)
              }}
              className={`text-[11px] px-3 py-1.5 ${
                !customScale && settings.overlayScale === scale ? 'bg-accent text-bg-solid' : 'text-text-dim'
              }`}
            >
              {Math.round(scale * 100)}%
            </button>
          ))}
          <button
            onClick={() => setCustomScale(true)}
            className={`text-[11px] px-3 py-1.5 ${customScale ? 'bg-accent text-bg-solid' : 'text-text-dim'}`}
          >
            Custom
          </button>
          {customScale && (
            <ScrubInput
              value={Math.round(settings.overlayScale * 100)}
              onChange={(v) => {
                if (v != null) update('overlayScale', v / 100)
              }}
              min={50}
              max={300}
              step={5}
              suffix="%"
            />
          )}
        </div>
      </section>

      {/* Close on click outside */}
      <section>
        <div
          onClick={() => update('closeOnClickOutside', !settings.closeOnClickOutside)}
          className="flex items-center gap-[10px] cursor-pointer select-none"
        >
          <Toggle checked={settings.closeOnClickOutside} onChange={(val) => update('closeOnClickOutside', val)} />
          <span className="text-xs text-text">Close overlay when clicking outside</span>
        </div>
      </section>

      {/* Update channel */}
      <section>
        <label>Update channel</label>
        <div className="flex gap-1.5 mt-[6px]">
          {(['stable', 'beta'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => update('updateChannel', ch)}
              className={`text-[11px] px-3 py-1.5 ${
                settings.updateChannel === ch ? 'bg-accent text-bg-solid' : 'text-text-dim'
              }`}
            >
              {ch === 'stable' ? 'Stable' : 'Beta'}
            </button>
          ))}
        </div>
        {settings.updateChannel === 'beta' && (
          <div className="mt-2 flex flex-col gap-1.5">
            <p className="text-[10px] text-text-dim">
              Warning: expect beta releases to break stuff and be generally annoying. Please join discord to tell me
              what to fix and watch me squirm
            </p>
            <a
              href="https://discord.com/invite/nUNcrmEAP5"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault()
                window.api.openExternal('https://discord.com/invite/nUNcrmEAP5')
              }}
              className="flex items-center justify-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded no-underline"
              style={{ background: '#5865F2', color: '#fff' }}
            >
              Join Discord
            </a>
          </div>
        )}
      </section>
    </>
  )
}
