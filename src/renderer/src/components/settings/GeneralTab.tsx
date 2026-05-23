import type { AppSettings } from '../../../../shared/types'
import { getGameFeatures } from '../../../../shared/game-features'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
}

export function GeneralTab({ settings, update }: Props): JSX.Element {
  const features = getGameFeatures(settings.poeVersion)
  const cachedLeagues = settings.poeVersion === 2 ? settings.leaguesPoe2 : settings.leaguesPoe1
  const leagueOptions: readonly string[] = cachedLeagues && cachedLeagues.length > 0 ? cachedLeagues : features.leagues

  return (
    <>
      <div className="settings-section-title mt-3">General</div>

      {/* League */}
      {(() => {
        // "Private League" is a sentinel option in the dropdown (matches APT's
        // pattern). When selected, an input below lets the user type the actual
        // private league name (e.g. "MyPL (PL12345)") which is what gets persisted
        // to settings.league and sent to the trade API verbatim. We detect "private
        // mode" by absence from the standard league list rather than a separate flag,
        // so a typed value that happens to match a standard league cleanly switches
        // back to dropdown mode.
        const PRIVATE_LEAGUE_LABEL = 'Private League'
        const isPrivate = !leagueOptions.includes(settings.league)
        return (
          <section>
            <label>League</label>
            <div className="setting-box mt-[6px] relative">
              <span className="value">{settings.league || PRIVATE_LEAGUE_LABEL}</span>
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
                value={isPrivate ? PRIVATE_LEAGUE_LABEL : settings.league}
                onChange={(e) => {
                  if (e.target.value === PRIVATE_LEAGUE_LABEL) {
                    // First-time switch into private mode: clear so the input below
                    // shows empty + placeholder. Re-selecting while already private
                    // is a no-op (the typed value stays).
                    if (!isPrivate) update('league', '')
                  } else {
                    update('league', e.target.value)
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
                value={settings.league}
                onChange={(e) => update('league', e.target.value)}
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
                // Mounted DismissibleTip instances only check localStorage on mount,
                // so reload to surface the dismissed tips again.
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
          </div>
        </section>
      )}
    </>
  )
}
