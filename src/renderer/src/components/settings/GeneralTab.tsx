import { useState } from 'react'
import type { AppSettings, ProfileSettingValue, RuntimeSettings } from '../../../../shared/types'
import { getGameFeatures } from '../../../../shared/game-features'
import { reportDiagnosticError } from '../../shared/diagnostics'

interface Props {
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateProfile: <K extends 'league'>(key: K, value: ProfileSettingValue<K>) => Promise<void>
}

export function GeneralTab({ settings, update, updateProfile }: Props): JSX.Element {
  const [reportMessage, setReportMessage] = useState<string | null>(null)
  const [reporting, setReporting] = useState(false)
  const [simulateCrash, setSimulateCrash] = useState(false)
  const features = getGameFeatures(settings.poeVersion)
  const cachedLeagues = settings.poeVersion === 2 ? settings.leaguesPoe2 : settings.leaguesPoe1
  const leagueOptions: readonly string[] = cachedLeagues && cachedLeagues.length > 0 ? cachedLeagues : features.leagues
  const activeLeague = settings.activeProfile?.league ?? ''

  const reportBug = async (): Promise<void> => {
    setReporting(true)
    setReportMessage(null)
    try {
      const result = await window.api.createBugReport()
      setReportMessage(`Report created: ${result.reportPath}`)
    } catch (err) {
      setReportMessage(err instanceof Error ? err.message : 'Failed to create report')
    } finally {
      setReporting(false)
    }
  }

  if (simulateCrash) {
    throw new Error('Simulated fatal renderer crash from Dev Only Stuff')
  }

  return (
    <>
      <div className="settings-section-title mt-3">General</div>

      {/* League */}
      {(() => {
        const PRIVATE_LEAGUE_LABEL = 'Private League'
        const isPrivate = !leagueOptions.includes(activeLeague)
        return (
          <section>
            <label>League</label>
            <div className="setting-box mt-[6px] relative">
              <span className="value">{activeLeague || PRIVATE_LEAGUE_LABEL}</span>
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
                value={isPrivate ? PRIVATE_LEAGUE_LABEL : activeLeague}
                onChange={(e) => {
                  if (e.target.value === PRIVATE_LEAGUE_LABEL) {
                    if (!isPrivate) updateProfile('league', '')
                  } else {
                    updateProfile('league', e.target.value)
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              >
                {leagueOptions.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value={PRIVATE_LEAGUE_LABEL}>{PRIVATE_LEAGUE_LABEL}</option>
              </select>
            </div>
            {isPrivate && (
              <input
                type="text"
                value={activeLeague}
                onChange={(e) => updateProfile('league', e.target.value)}
                placeholder="Enter Private League - Full name including (PL#####)"
                className="mt-[6px] w-full text-[11px] bg-black/30 rounded px-2 py-[5px] border-none"
              />
            )}
          </section>
        )
      })()}

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

      <section>
        <label>Filter sound preview volume</label>
        <div className="flex items-center gap-[10px] mt-[2px]">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round((settings.previewVolume ?? 0.25) * 100)}
            onChange={(e) => update('previewVolume', parseInt(e.target.value, 10) / 100)}
            className="flex-1"
          />
          <span className="text-[13px] font-semibold text-text min-w-[36px] text-right">
            {Math.round((settings.previewVolume ?? 0.25) * 100)}%
          </span>
        </div>
      </section>

      <section>
        <label>Bug reports</label>
        <div className="mt-[6px] flex flex-col gap-2">
          <button onClick={reportBug} disabled={reporting} className="self-start text-[11px] px-3 py-1.5 text-text-dim">
            {reporting ? 'Creating report...' : 'Report a bug'}
          </button>
          {reportMessage && <div className="text-[10px] text-text-dim break-all">{reportMessage}</div>}
        </div>
      </section>

      {import.meta.env.DEV && (
        <section>
          <div className="settings-section-title mt-3">Dev Only Stuff</div>
          <div className="flex gap-1.5 mt-[6px] flex-wrap">
            <button
              onClick={() => {
                for (let i = localStorage.length - 1; i >= 0; i--) {
                  const k = localStorage.key(i)
                  if (k && k.startsWith('tip.')) localStorage.removeItem(k)
                }
                window.location.reload()
              }}
              className="text-[11px] px-3 py-1.5 text-text-dim"
            >
              Reset tooltips
            </button>
            <button
              onClick={() => window.api.devFakeUpdate()}
              className="text-[11px] px-3 py-1.5 text-text-dim"
              title="Inject a fake update-available event so you can test the channel-switch rescind flow"
            >
              Fake update banner
            </button>
            <button
              onClick={() =>
                reportDiagnosticError(
                  'renderer',
                  'action',
                  new Error('Simulated small renderer error from Dev Only Stuff'),
                  'Dev Only Stuff: simulate a small error',
                )
              }
              className="text-[11px] px-3 py-1.5 text-text-dim"
              title="Report a handled diagnostics error without breaking the UI"
            >
              Simulate a small error
            </button>
            <button
              onClick={() => setSimulateCrash(true)}
              className="text-[11px] px-3 py-1.5 text-text-dim"
              title="Throw during render so the diagnostics error boundary catches it"
            >
              Simulate a fatal crash
            </button>
          </div>
        </section>
      )}
    </>
  )
}
