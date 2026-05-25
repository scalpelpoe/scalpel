import { useState } from 'react'
import type { AppSettings } from '../../../../shared/types'
import { getGameFeatures } from '../../../../shared/game-features'
import { reportDiagnosticError } from '../../shared/diagnostics'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateProfile: (key: 'league', value: unknown) => Promise<void>
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
        // "Private League" is a sentinel option in the dropdown (matches APT's
        // pattern). When selected, an input below lets the user type the actual
        // private league name (e.g. "MyPL (PL12345)") which is what gets persisted
        // to the active profile's league and sent to the trade API verbatim. We
        // detect "private mode" by absence from the standard league list rather
        // than a separate flag, so a typed value that happens to match a standard
        // league cleanly switches back to dropdown mode.
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
                    // First-time switch into private mode: clear so the input below
                    // shows empty + placeholder. Re-selecting while already private
                    // is a no-op (the typed value stays).
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