import { useEffect, useState } from 'react'
import type { AppSettings, PoeProfileSummary, RuntimeSettings } from '@shared/types'
import { LeagueDropdown } from '../../components/LeagueDropdown'
import { Toggle } from '../../components/Toggle'
import { resolveLeagueOptions } from '@renderer/shared/league-options'
import type { SelectedGames } from '../constants'
import { NavButtons } from '../NavButtons'
import { StepHeader } from '../StepHeader'
import { m } from '@shared/paraglide/messages.js'
import { PRESETS } from '@shared/theme/presets'
import { ThemePresetGrid, applyThemePreset } from '@renderer/shared/ThemePresetGrid'
import { OpenSideSelector } from '@renderer/shared/OpenSideSelector'

export function PreferencesStep({
  settings,
  selectedGames,
  onUpdate,
  onProfileUpdateForGame,
  onNext,
  onBack,
  stepNum,
  totalSteps,
  onBackToSettings,
}: {
  settings: RuntimeSettings
  selectedGames: SelectedGames
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onProfileUpdateForGame: (game: 1 | 2, key: 'league', value: string) => Promise<void>
  onNext: () => void
  onBack: () => void
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
}): JSX.Element {
  const both = selectedGames.poe1 && selectedGames.poe2
  const [profiles, setProfiles] = useState<PoeProfileSummary[]>([])

  useEffect(() => {
    if (!both) return
    void window.api.listProfiles().then(setProfiles)
  }, [both, settings.activeProfileId, settings.lastProfileIdPoe1, settings.lastProfileIdPoe2])

  const leagueForGame = (game: 1 | 2): string => {
    if (!both) return settings.activeProfile?.league ?? ''
    const lastId = game === 2 ? settings.lastProfileIdPoe2 : settings.lastProfileIdPoe1
    return (
      profiles.find((profile) => profile.id === lastId)?.league ??
      profiles.find((profile) => profile.gameVariant === game)?.league ??
      ''
    )
  }

  const updateLeagueForGame = (game: 1 | 2, league: string): void => {
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === (game === 2 ? settings.lastProfileIdPoe2 : settings.lastProfileIdPoe1)
          ? { ...profile, league }
          : profile,
      ),
    )
    void onProfileUpdateForGame(game, 'league', league).then(() => window.api.listProfiles().then(setProfiles))
  }

  // Prefer the live-fetched league lists from the trade APIs; fall back to the
  // hardcoded list in shared/game-features.ts if the launch-time fetch failed.
  const poe1Leagues = resolveLeagueOptions(settings, 1)
  const poe2Leagues = resolveLeagueOptions(settings, 2)

  // The joke theme and the custom-palette editor stay in Settings. With
  // `flashbang` dropped this is 8 presets, which lays out as two rows of four.
  const onboardingPresets = PRESETS.filter((p) => p.id !== 'flashbang')
  return (
    <div>
      <StepHeader
        stepNum={stepNum}
        totalSteps={totalSteps}
        title={m.onb_prefs_title()}
        subtitle={m.onb_prefs_subtitle()}
      />
      <div className="flex flex-col gap-5">
        {both ? (
          <section className="flex flex-col gap-3">
            <LeagueDropdown
              id="league-poe1-onboarding"
              label={m.onb_prefs_poe1_league()}
              value={leagueForGame(1)}
              options={poe1Leagues}
              onChange={(v) => updateLeagueForGame(1, v)}
            />
            <LeagueDropdown
              id="league-poe2-onboarding"
              label={m.onb_prefs_poe2_league()}
              value={leagueForGame(2)}
              options={poe2Leagues}
              onChange={(v) => updateLeagueForGame(2, v)}
            />
          </section>
        ) : (
          <section>
            <LeagueDropdown
              id="league-select-onboarding"
              label={m.settings_league_label()}
              value={settings.activeProfile?.league ?? ''}
              options={selectedGames.poe2 ? poe2Leagues : poe1Leagues}
              onChange={(v) => onProfileUpdateForGame(selectedGames.poe2 ? 2 : 1, 'league', v)}
            />
          </section>
        )}

        <section>
          <label className="text-xs text-text">{m.onb_prefs_theme()}</label>
          <ThemePresetGrid
            presets={onboardingPresets}
            selectedId={settings.themeId}
            onSelect={(id) => applyThemePreset(id, settings, onUpdate)}
          />
        </section>

        <section>
          <label className="text-xs text-text">{m.onb_prefs_open_side()}</label>
          <OpenSideSelector value={settings.openSide} onChange={(v) => onUpdate('openSide', v)} />
        </section>

        {settings.platform !== 'linux' && (
          <section>
            <div
              onClick={() => onUpdate('closeOnClickOutside', !settings.closeOnClickOutside)}
              className="flex items-center gap-[10px] cursor-pointer select-none"
            >
              <Toggle checked={settings.closeOnClickOutside} onChange={(val) => onUpdate('closeOnClickOutside', val)} />
              <span className="text-xs text-text">{m.settings_close_on_click_outside()}</span>
            </div>
          </section>
        )}

        <section>
          <div
            onClick={() => onUpdate('reloadOnSave', !settings.reloadOnSave)}
            className="flex items-center gap-[10px] cursor-pointer select-none"
          >
            <Toggle checked={settings.reloadOnSave} onChange={(val) => onUpdate('reloadOnSave', val)} />
            <span className="text-xs text-text">{m.onb_prefs_reload()}</span>
          </div>
        </section>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} onBackToSettings={onBackToSettings} />
    </div>
  )
}
