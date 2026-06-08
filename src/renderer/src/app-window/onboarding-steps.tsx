import { Info } from '@icon-park/react'
import { useEffect, useState } from 'react'
import { useAuth } from '../shared/use-auth'
import appIcon from '../../../../resources/icon.png'
import { getGameFeatures } from '../../../shared/game-features'
import type { AppSettings, PoeProfileSummary, RuntimeSettings } from '../../../shared/types'
import poeFilterSettingImg from '../assets/other/poe-filter-setting.png'
import poe1Logo from '../assets/other/poe1-logo.png'
import poe2Logo from '../assets/other/poe2-logo.png'
import { FilterPicker } from '../components/FilterPicker'
import { LeagueDropdown } from '../components/LeagueDropdown'
import { HotkeyField } from '../components/primitives/HotkeyField'
import { Toggle } from '../components/Toggle'
import { IconGlow } from '../shared/IconGlow'
import type { SelectedGames } from './constants'
import { NavButtons } from './NavButtons'
import { StepHeader } from './StepHeader'
import { m } from '../../../shared/paraglide/messages.js'

function GameCard({
  alt,
  image,
  selected,
  onClick,
}: {
  alt: string
  image: string
  selected: boolean
  onClick: () => void
}): JSX.Element {
  const [hovered, setHovered] = useState(false)
  // selected = full color; hovered (but not selected) = 25% greyscale; otherwise = full greyscale
  const filter = selected ? 'none' : hovered ? 'grayscale(25%) brightness(0.85)' : 'grayscale(100%) brightness(0.65)'
  const opacity = selected ? 1 : hovered ? 0.95 : 0.85
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="relative flex-1 rounded-lg p-0 cursor-pointer transition-all duration-150 bg-transparent overflow-hidden"
      style={{
        border: selected ? '3px solid var(--accent)' : '3px solid transparent',
        maxWidth: 150,
      }}
    >
      <img
        src={image}
        alt={alt}
        className="block w-full h-auto rounded-md transition-all duration-150"
        style={{ filter, opacity }}
      />
    </button>
  )
}

export function WelcomeStep({
  selectedGames,
  onSelectedGamesChange,
  onNext,
  onBackToSettings,
}: {
  selectedGames: SelectedGames
  onSelectedGamesChange: (g: SelectedGames) => void
  onNext: () => void
  onBackToSettings?: () => void
}): JSX.Element {
  const anySelected = selectedGames.poe1 || selectedGames.poe2
  return (
    <div>
      <IconGlow
        src={appIcon}
        size={64}
        blur={28}
        saturate={2}
        opacity={0.2}
        glowWidth={220}
        glowHeight={220}
        alt="Scalpel"
        className="mb-5"
      />
      <StepHeader title={m.onb_welcome_title()} subtitle={m.onb_welcome_subtitle()} />
      <div className="mb-5">
        <div className="flex gap-6 justify-center">
          <GameCard
            alt={m.onb_poe1_alt()}
            image={poe1Logo}
            selected={selectedGames.poe1}
            onClick={() => onSelectedGamesChange({ ...selectedGames, poe1: !selectedGames.poe1 })}
          />
          <GameCard
            alt={m.onb_poe2_alt()}
            image={poe2Logo}
            selected={selectedGames.poe2}
            onClick={() => onSelectedGamesChange({ ...selectedGames, poe2: !selectedGames.poe2 })}
          />
        </div>
      </div>
      <NavButtons
        onNext={onNext}
        nextLabel={m.common_continue()}
        nextDisabled={!anySelected}
        onBackToSettings={onBackToSettings}
      />
    </div>
  )
}

/** Returns "PoE1" / "PoE2" when both games are being set up, or "" for
 *  single-game flow where the prefix would be redundant. */
function gameLabel(game: 1 | 2 | null): string {
  return game === 1 ? 'PoE1' : game === 2 ? 'PoE2' : ''
}

export function FilterFolderStep({
  settings,
  onSettingsChange,
  onNext,
  onBack,
  game,
  stepNum,
  totalSteps,
  onBackToSettings,
}: {
  settings: RuntimeSettings
  onSettingsChange: (s: RuntimeSettings) => void
  onNext: () => void
  onBack?: () => void
  game: 1 | 2 | null
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
}): JSX.Element {
  const prefix = gameLabel(game)
  const folderHint = getGameFeatures(game ?? 1).filterFolderHint
  return (
    <div>
      <StepHeader
        stepNum={stepNum}
        totalSteps={totalSteps}
        title={prefix ? m.onb_folder_title_game({ prefix }) : m.onb_folder_title()}
        subtitle={m.onb_folder_subtitle({ hint: folderHint })}
      />
      <FilterPicker settings={settings} onSettingsChange={onSettingsChange} mode="folder" />
      <NavButtons
        onBack={onBack}
        onNext={onNext}
        secondaryLabel={m.onb_skip_for_now()}
        onSecondary={onNext}
        onBackToSettings={onBackToSettings}
      />
    </div>
  )
}

export function FilterStep({
  settings,
  onSettingsChange,
  onNext,
  onBack,
  onOnlineImport,
  game,
  stepNum,
  totalSteps,
  onBackToSettings,
}: {
  settings: RuntimeSettings
  onSettingsChange: (s: RuntimeSettings) => void
  onNext: () => void
  onBack: () => void
  onOnlineImport?: (name: string) => void
  game: 1 | 2 | null
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
}): JSX.Element {
  const prefix = gameLabel(game)
  return (
    <div>
      <StepHeader
        stepNum={stepNum}
        totalSteps={totalSteps}
        title={prefix ? m.onb_filter_title_game({ prefix }) : m.onb_filter_title()}
        subtitle={m.onb_filter_subtitle()}
      />
      <div className="-mt-3">
        <FilterPicker
          settings={settings}
          onSettingsChange={onSettingsChange}
          onOnlineImport={onOnlineImport}
          mode="list"
          maxListHeight={140}
        />
      </div>
      <NavButtons
        onBack={onBack}
        onNext={onNext}
        nextDisabled={!settings.activeProfile?.filterPath}
        secondaryLabel={m.onb_skip_for_now()}
        onSecondary={onNext}
        onBackToSettings={onBackToSettings}
      />
    </div>
  )
}

export function OnlineFilterSetupStep({
  filterName,
  onNext,
  onBack,
  stepNum,
  totalSteps,
  onBackToSettings,
}: {
  filterName: string
  onNext: () => void
  onBack: () => void
  stepNum?: number
  totalSteps?: number
  onBackToSettings?: () => void
}): JSX.Element {
  return (
    <div>
      <StepHeader
        title={m.onb_online_title()}
        subtitle={m.onb_online_subtitle({ filter: filterName })}
        stepNum={stepNum}
        totalSteps={totalSteps}
      />

      <ol className="text-xs text-text-dim m-0 pl-5 leading-8 list-decimal -mt-4">
        <li>{m.onb_online_step1()}</li>
        <li>{m.onb_online_step2()}</li>
        <li>{m.onb_online_step3({ filter: filterName })}</li>
      </ol>

      <img
        src={poeFilterSettingImg}
        alt={m.onb_online_img_alt()}
        className="mt-4 rounded border border-border w-full"
      />

      <NavButtons onNext={onNext} onBack={onBack} nextLabel={m.common_done()} onBackToSettings={onBackToSettings} />
    </div>
  )
}

export function HotkeyStep({
  settings,
  onUpdate,
  onNext,
  onBack,
  stepNum,
  totalSteps,
  onBackToSettings,
  showWasdTip,
}: {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onNext: () => void
  onBack: () => void
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
  showWasdTip?: boolean
}): JSX.Element {
  return (
    <div>
      <StepHeader
        stepNum={stepNum}
        totalSteps={totalSteps}
        title={m.onb_hotkey_title()}
        subtitle={m.onb_hotkey_subtitle()}
      />
      <HotkeyField value={settings.hotkey} onChange={(acc) => onUpdate('hotkey', acc)} />
      <WasdHotkeyTip show={showWasdTip} />
      <NavButtons onBack={onBack} onNext={onNext} onBackToSettings={onBackToSettings} />
    </div>
  )
}

/** PoE2 binds W/A/S/D to movement, so a hotkey sharing one of those letters makes
 *  the character lurch when fired. We can't fully suppress it (the game reads raw
 *  key state), so nudge WASD players toward a combo without those letters. */
function WasdHotkeyTip({ show }: { show?: boolean }): JSX.Element | null {
  if (!show) return null
  return (
    <p className="text-[10px] text-text-dim flex items-center gap-1 m-0 ml-1 mt-1.5">
      <Info size={12} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} className="flex shrink-0" />
      Tip: If you play WASD, it's best to choose a hotkey combo without those letters.
    </p>
  )
}

export function PriceCheckHotkeyStep({
  settings,
  onUpdate,
  onNext,
  onBack,
  stepNum,
  totalSteps,
  onBackToSettings,
  showWasdTip,
}: {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onNext: () => void
  onBack: () => void
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
  showWasdTip?: boolean
}): JSX.Element {
  return (
    <div>
      <StepHeader
        stepNum={stepNum}
        totalSteps={totalSteps}
        title={m.onb_pc_hotkey_title()}
        subtitle={m.onb_pc_hotkey_subtitle()}
      />
      <HotkeyField value={settings.priceCheckHotkey} onChange={(acc) => onUpdate('priceCheckHotkey', acc)} />
      <WasdHotkeyTip show={showWasdTip} />
      <NavButtons onBack={onBack} onNext={onNext} onBackToSettings={onBackToSettings} />
    </div>
  )
}

export function TradeLoginStep({
  onNext,
  onBack,
  stepNum,
  totalSteps,
  onBackToSettings,
}: {
  onNext: () => void
  onBack: () => void
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
}): JSX.Element {
  const { auth, login, logout } = useAuth()

  return (
    <div>
      <StepHeader
        stepNum={stepNum}
        totalSteps={totalSteps}
        title={m.onb_trade_title()}
        subtitle={m.onb_trade_subtitle()}
      />
      <div className="setting-box mb-6">
        {auth === null ? (
          <span className="value text-text-dim">{m.onb_trade_checking()}</span>
        ) : auth.loggedIn ? (
          <>
            <span className="value text-accent">{m.onb_trade_logged_in({ account: auth.accountName })}</span>
            <button
              className="text-[11px] text-text-dim shrink-0 ml-2 px-3 py-[5px]"
              onClick={() => {
                logout()
              }}
            >
              {m.common_logout()}
            </button>
          </>
        ) : (
          <>
            <span className="value text-text-dim">{m.onb_trade_not_logged_in()}</span>
            <button
              className="primary"
              onClick={() => {
                login()
              }}
            >
              {m.common_login()}
            </button>
          </>
        )}
      </div>
      <NavButtons
        onBack={onBack}
        onNext={onNext}
        nextLabel={auth?.loggedIn ? m.common_continue() : m.common_skip()}
        onBackToSettings={onBackToSettings}
      />
    </div>
  )
}

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
  const poe1Leagues: readonly string[] =
    settings.leaguesPoe1 && settings.leaguesPoe1.length > 0 ? settings.leaguesPoe1 : getGameFeatures(1).leagues
  const poe2Leagues: readonly string[] =
    settings.leaguesPoe2 && settings.leaguesPoe2.length > 0 ? settings.leaguesPoe2 : getGameFeatures(2).leagues
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
          <div
            onClick={() => onUpdate('closeOnClickOutside', !settings.closeOnClickOutside)}
            className="flex items-center gap-[10px] cursor-pointer select-none"
          >
            <Toggle checked={settings.closeOnClickOutside} onChange={(val) => onUpdate('closeOnClickOutside', val)} />
            <span className="text-xs text-text">{m.settings_close_on_click_outside()}</span>
          </div>
        </section>

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
      <NavButtons onBack={onBack} onNext={onNext} nextLabel={m.common_finish()} onBackToSettings={onBackToSettings} />
    </div>
  )
}

export function DoneStep({
  onOpenSettings,
  onCloseWindow,
}: {
  onOpenSettings: () => void
  onCloseWindow: () => void
}): JSX.Element {
  return (
    <div>
      <StepHeader title={m.onb_done_title()} subtitle={m.onb_done_subtitle()} />
      <div className="flex gap-[10px] mt-8">
        <button className="primary px-6 py-[10px] text-[13px] font-semibold" onClick={onOpenSettings}>
          {m.onb_done_open_settings()}
        </button>
        <button onClick={onCloseWindow} className="px-6 py-[10px] text-[13px]">
          {m.onb_done_close_window()}
        </button>
      </div>
    </div>
  )
}
