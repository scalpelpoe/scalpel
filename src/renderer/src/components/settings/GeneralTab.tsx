import { useState } from 'react'
import { Github } from '@icon-park/react'
import type { AppSettings, ProfileSettingValue, RuntimeSettings } from '../../../../shared/types'
import { getGameFeatures } from '../../../../shared/game-features'
import { GITHUB_REPO_URL, KOFI_URL } from '../../../../shared/endpoints'
import { reportDiagnosticError } from '../../shared/diagnostics'
import kofiIcon from '../../assets/other/kofi-logo.svg'
import { SettingToggleBox } from './SettingToggleBox'
import { LOCALE_LABELS, setAppLocale, SUPPORTED_LOCALES, useCurrentLocale } from '../../shared/locale'
import { m } from '../../../../shared/paraglide/messages.js'

interface Props {
  settings: RuntimeSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  updateProfile: <K extends 'league'>(key: K, value: ProfileSettingValue<K>) => Promise<void>
  /** Dev-only: re-enter the onboarding flow to review it. Present in app mode only. */
  onShowOnboarding?: () => void
}

export function GeneralTab({ settings, update, updateProfile, onShowOnboarding }: Props): JSX.Element {
  const locale = useCurrentLocale()
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
      setReportMessage(m.settings_report_created({ path: result.reportPath }))
    } catch (err) {
      setReportMessage(err instanceof Error ? err.message : m.settings_report_failed())
    } finally {
      setReporting(false)
    }
  }

  if (simulateCrash) {
    throw new Error('Simulated fatal renderer crash from Dev Only Stuff')
  }

  return (
    <>
      <div className="settings-section-title mt-3">{m.settings_general_heading()}</div>

      <SettingToggleBox
        label={m.settings_start_in_tray()}
        checked={settings.startInTray}
        onChange={(val) => update('startInTray', val)}
      />

      {/* Language. Reads the live locale (not settings.locale) so the box reflects
          the switch immediately; setAppLocale persists + broadcasts to other windows. */}
      <section>
        <label>{m.settings_language_label()}</label>
        <div className="setting-box mt-[6px] relative">
          <span className="value">{LOCALE_LABELS[locale]}</span>
          <button
            className="primary"
            onClick={() => {
              const sel = document.getElementById('language-select') as HTMLSelectElement | null
              sel?.showPicker?.()
              sel?.focus()
            }}
          >
            {m.common_change()}
          </button>
          <select
            id="language-select"
            value={locale}
            onChange={(e) => setAppLocale(e.target.value as (typeof SUPPORTED_LOCALES)[number])}
            className="absolute inset-0 opacity-0 cursor-pointer"
          >
            {SUPPORTED_LOCALES.map((code) => (
              <option key={code} value={code}>
                {LOCALE_LABELS[code]}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* League */}
      {(() => {
        const PRIVATE_LEAGUE_LABEL = m.settings_private_league()
        const isPrivate = !leagueOptions.includes(activeLeague)
        return (
          <section>
            <label>{m.settings_league_label()}</label>
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
                {m.common_change()}
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
                placeholder={m.settings_private_league_placeholder()}
                className="mt-[6px] w-full text-[11px] bg-black/30 rounded px-2 py-[5px] border-none"
              />
            )}
          </section>
        )
      })()}

      {/* Update channel */}
      <section>
        <label>{m.settings_update_channel()}</label>
        <div className="flex gap-1.5 mt-[6px]">
          {(['stable', 'beta', 'experimental'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => update('updateChannel', ch)}
              className={`text-[11px] px-3 py-1.5 ${
                settings.updateChannel === ch ? 'bg-accent text-bg-solid' : 'text-text-dim'
              }`}
            >
              {{
                stable: m.settings_channel_stable,
                beta: m.settings_channel_beta,
                experimental: m.settings_channel_experimental,
              }[ch]()}
            </button>
          ))}
        </div>
        {settings.updateChannel !== 'stable' && (
          <div className="mt-2 flex flex-col gap-1.5">
            <p className="text-[10px] text-text-dim">
              {settings.updateChannel === 'experimental'
                ? m.settings_experimental_warning()
                : m.settings_beta_warning()}
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
              {m.settings_join_discord()}
            </a>
          </div>
        )}
      </section>

      <section>
        <label>{m.settings_preview_volume()}</label>
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
        <label>{m.settings_bug_reports()}</label>
        <div className="mt-[6px] flex flex-col gap-2">
          <button onClick={reportBug} disabled={reporting} className="self-start text-[11px] px-3 py-1.5 text-text-dim">
            {reporting ? m.settings_report_creating() : m.settings_report_a_bug()}
          </button>
          <p className="text-[10px] text-text-dim">{m.settings_bug_reports_desc()}</p>
          {reportMessage && <div className="text-[10px] text-text-dim break-all">{reportMessage}</div>}
        </div>
      </section>

      <section>
        <div className="settings-section-title mt-3">{m.settings_support_development()}</div>
        <div className="flex gap-1.5 mt-[6px] flex-wrap">
          <button
            onClick={() => window.api.openExternal(KOFI_URL)}
            className="flex items-center gap-1.5 text-[11px] leading-none px-3 py-1.5 text-text-dim"
          >
            <img src={kofiIcon} alt="" className="w-[14px] h-[14px] object-contain" />
            <span className="-translate-y-[1px]">Ko-fi</span>
          </button>
          <button
            onClick={() => window.api.openExternal(GITHUB_REPO_URL)}
            className="flex items-center gap-1.5 text-[11px] leading-none px-3 py-1.5 text-text-dim"
          >
            <Github theme="filled" size="14" />
            <span className="-translate-y-[1px]">GitHub</span>
          </button>
        </div>
      </section>

      {import.meta.env.DEV && (
        <section>
          <div className="settings-section-title mt-3">{m.settings_dev_only()}</div>
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
              {m.settings_reset_tooltips()}
            </button>
            <button
              onClick={() => window.api.devFakeUpdate()}
              className="text-[11px] px-3 py-1.5 text-text-dim"
              title="Inject a fake update-available event so you can test the channel-switch rescind flow"
            >
              {m.settings_fake_update_banner()}
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
              {m.settings_simulate_small_error()}
            </button>
            <button
              onClick={() => setSimulateCrash(true)}
              className="text-[11px] px-3 py-1.5 text-text-dim"
              title="Throw during render so the diagnostics error boundary catches it"
            >
              {m.settings_simulate_fatal_crash()}
            </button>
            {onShowOnboarding && (
              <button
                onClick={onShowOnboarding}
                className="text-[11px] px-3 py-1.5 text-text-dim"
                title="Re-enter the onboarding flow to review it"
              >
                {m.settings_review_onboarding()}
              </button>
            )}
            <button
              onClick={() => void window.api.resetLearning('all')}
              className="text-[11px] px-3 py-1.5 text-text-dim"
              title="Clear all adaptive price-check learned preferences"
            >
              {m.settings_reset_pc_learnings()}
            </button>
          </div>
        </section>
      )}
    </>
  )
}
