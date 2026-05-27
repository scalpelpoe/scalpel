import { useEffect, useState } from 'react'
import { Info } from '@icon-park/react'
import { useAuth } from '../shared/use-auth'
import appIcon from '../../../../resources/icon.png'
import { getGameFeatures } from '../../../shared/game-features'
import type { AppSettings, PoeProfileSummary, RuntimeSettings } from '../../../shared/types'
import poeFilterSettingImg from '../assets/other/poe-filter-setting.png'
import poe1Logo from '../assets/other/poe1-logo.png'
import poe2Logo from '../assets/other/poe2-logo.png'
import { FilterPicker } from '../components/FilterPicker'
import { LeagueDropdown } from '../components/LeagueDropdown'
import { HotkeyField } from '../components/settings'
import { Toggle } from '../components/Toggle'
import { IconGlow } from '../shared/IconGlow'
import type { SelectedGames } from './constants'
import { NavButtons } from './NavButtons'
import { StepHeader } from './StepHeader'

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
      <StepHeader
        title="Welcome to Scalpel"
        subtitle="Path of Exile's first fourth-party tool. Select which game(s) you play to get started."
      />
      <div className="mb-5">
        <div className="flex gap-6 justify-center">
          <GameCard
            alt="Path of Exile 1"
            image={poe1Logo}
            selected={selectedGames.poe1}
            onClick={() => onSelectedGamesChange({ ...selectedGames, poe1: !selectedGames.poe1 })}
          />
          <GameCard
            alt="Path of Exile 2"
            image={poe2Logo}
            selected={selectedGames.poe2}
            onClick={() => onSelectedGamesChange({ ...selectedGames, poe2: !selectedGames.poe2 })}
          />
        </div>
      </div>
      <NavButtons
        onNext={onNext}
        nextLabel="Continue"
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
        title={prefix ? `Point to your ${prefix} filter folder` : 'Point to your filter folder'}
        subtitle={`Choose your filter folder, generally ${folderHint}, so Scalpel can find your filters. You can skip this and set it up later from settings.`}
      />
      <FilterPicker settings={settings} onSettingsChange={onSettingsChange} mode="folder" />
      <NavButtons
        onBack={onBack}
        onNext={onNext}
        secondaryLabel="Skip for now"
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
        title={prefix ? `Select your ${prefix} filter` : 'Select your filter'}
        subtitle="Pick your starting filter, or skip this for now and add one later from settings. If you select an online filter, it will be resaved locally for fast editing."
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
        secondaryLabel="Skip for now"
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
        title="Set your filter in game"
        subtitle={`"${filterName}.filter" has been copied to your filter folder. You need to select it in Path of Exile's settings so the game uses it.`}
        stepNum={stepNum}
        totalSteps={totalSteps}
      />

      <ol className="text-xs text-text-dim m-0 pl-5 leading-8 list-decimal -mt-4">
        <li>
          Open <strong className="text-text">Options</strong> in Path of Exile
        </li>
        <li>
          Go to the <strong className="text-text">Game</strong> tab
        </li>
        <li>
          Under <strong className="text-text">Item Filter</strong>, select{' '}
          <strong className="text-accent">{filterName}</strong> from the dropdown
        </li>
      </ol>

      <img src={poeFilterSettingImg} alt="PoE filter dropdown" className="mt-4 rounded border border-border w-full" />

      <NavButtons onNext={onNext} onBack={onBack} nextLabel="Done" onBackToSettings={onBackToSettings} />
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
}: {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onNext: () => void
  onBack: () => void
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
}): JSX.Element {
  return (
    <div>
      <StepHeader
        stepNum={stepNum}
        totalSteps={totalSteps}
        title="Set your filter hotkey"
        subtitle="This key combo activates the overlay while you're in game. Hover an item and press it to analyze your filter."
      />
      <HotkeyField value={settings.hotkey} onChange={(acc) => onUpdate('hotkey', acc)} />
      <NavButtons onBack={onBack} onNext={onNext} onBackToSettings={onBackToSettings} />
    </div>
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
}: {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onNext: () => void
  onBack: () => void
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
}): JSX.Element {
  return (
    <div>
      <StepHeader
        stepNum={stepNum}
        totalSteps={totalSteps}
        title="Set your price check hotkey"
        subtitle="This key combo is used to... price check items. You should know how to use this one."
      />
      <HotkeyField value={settings.priceCheckHotkey} onChange={(acc) => onUpdate('priceCheckHotkey', acc)} />
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
        title="Log into the trade site"
        subtitle="This is optional, but logging in lets you travel directly to a seller's hideout to buy items from within Scalpel."
      />
      <div className="setting-box mb-6">
        {auth === null ? (
          <span className="value text-text-dim">Checking...</span>
        ) : auth.loggedIn ? (
          <>
            <span className="value text-accent">Logged in as {auth.accountName}</span>
            <button
              className="text-[11px] text-text-dim shrink-0 ml-2 px-3 py-[5px]"
              onClick={() => {
                logout()
              }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <span className="value text-text-dim">Not logged in</span>
            <button
              className="primary"
              onClick={() => {
                login()
              }}
            >
              Login
            </button>
          </>
        )}
      </div>
      <NavButtons
        onBack={onBack}
        onNext={onNext}
        nextLabel={auth?.loggedIn ? 'Continue' : 'Skip'}
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
        title="Preferences"
        subtitle="You can always change these later from settings."
      />
      <div className="flex flex-col gap-5">
        {both ? (
          <section className="flex flex-col gap-3">
            <LeagueDropdown
              id="league-poe1-onboarding"
              label="PoE1 League"
              value={leagueForGame(1)}
              options={poe1Leagues}
              onChange={(v) => updateLeagueForGame(1, v)}
            />
            <LeagueDropdown
              id="league-poe2-onboarding"
              label="PoE2 League"
              value={leagueForGame(2)}
              options={poe2Leagues}
              onChange={(v) => updateLeagueForGame(2, v)}
            />
          </section>
        ) : (
          <section>
            <LeagueDropdown
              id="league-select-onboarding"
              label="League"
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
            <span className="text-xs text-text">Close overlay when clicking outside</span>
          </div>
        </section>

        <section>
          <div
            onClick={() => onUpdate('reloadOnSave', !settings.reloadOnSave)}
            className="flex items-center gap-[10px] cursor-pointer select-none"
          >
            <Toggle checked={settings.reloadOnSave} onChange={(val) => onUpdate('reloadOnSave', val)} />
            <span className="text-xs text-text">Reload filter in game on every change</span>
          </div>
        </section>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Finish" onBackToSettings={onBackToSettings} />
    </div>
  )
}

export function DoneStep({ onFinish }: { onFinish: () => void }): JSX.Element {
  return (
    <div>
      <StepHeader
        title="You're all set!"
        subtitle="Scalpel is running in your system tray. Hop into Path of Exile, hover an item, and press your hotkey to get started. Feel free to close this window."
      />
      <div className="flex gap-[10px] mt-8">
        <button className="primary px-6 py-[10px] text-[13px] font-semibold" onClick={onFinish}>
          Open Settings
        </button>
        <button onClick={() => window.close()} className="px-6 py-[10px] text-[13px]">
          Close Window
        </button>
      </div>
    </div>
  )
}
