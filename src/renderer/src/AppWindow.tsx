import { Fragment, useEffect, useRef, useState } from 'react'
import type { AppSettings, PoeProfileSummary, ProfileSettingValue, RuntimeSettings } from '@shared/types'
import {
  type Step,
  STEP_ORDER,
  type SelectedGames,
  resolveResumeStep,
  totalOnboardingSteps,
} from './app-window/constants'
import {
  backStepFromFilterFolder,
  backStepFromHotkey,
  filterFolderStepFor,
  filterStepFor,
  filterStepNum,
  nextStepAfterFilter,
  nextStepAfterOnlineSetup,
  onlineSetupStepFor,
  selectedGameOrder,
  sharedStepNum,
} from './app-window/onboarding-nav'
import { SlideIn } from './app-window/SlideIn'
import {
  WelcomeStep,
  FilterFolderStep,
  FilterStep,
  OnlineFilterSetupStep,
  HotkeyStep,
  TradeStep,
  PreferencesStep,
  PluginsStep,
  MacrosStep,
  DoneStep,
} from './app-window/steps'
import { AppSettingsWrapper } from './app-window/AppSettingsWrapper'
import { AppUpdateBanner } from './app-window/AppUpdateBanner'
import { LinuxDisclaimerBanner } from './components/LinuxDisclaimerBanner'
import { GameSwitchModal } from './components/GameSwitchModal'
import { PoeVersionProvider } from './shared/poe-version-context'

type ImportedOnline = { poe1: string | null; poe2: string | null }

export function AppWindow(): JSX.Element {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<Step>('welcome')
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [importedOnline, setImportedOnline] = useState<ImportedOnline>({ poe1: null, poe2: null })
  const [gameSwitchTarget, setGameSwitchTarget] = useState<1 | 2 | null>(null)
  const [selectedGames, setSelectedGames] = useState<SelectedGames>({ poe1: false, poe2: false })
  const [settingsTabRequest, setSettingsTabRequest] = useState<{ tab: string; n: number } | null>(null)
  // Set when "Review onboarding" is clicked from settings (dev only) so the
  // focus-bounce effect below doesn't yank the user back to settings on focus.
  const [revisitingOnboarding, setRevisitingOnboarding] = useState(false)

  const goTo = (next: Step, resumeGames = selectedGames): void => {
    const curIdx = STEP_ORDER.indexOf(step)
    const nextIdx = STEP_ORDER.indexOf(next)
    setDirection(nextIdx >= curIdx ? 'forward' : 'back')
    setStep(next)
    if (next !== 'settings' && next !== 'done') {
      window.api.setSetting('onboardingStep', next)
      window.api.setSetting('onboardingSelectedGames', resumeGames)
      window.api.setSetting('onboardingImportedOnline', importedOnline)
    }
  }

  // Each step reuses the same scroll container, so without this a step entered
  // from the bottom of a tall one opens scrolled past its own heading.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [step])

  const switchOnboardingGame = async (target: 1 | 2): Promise<void> => {
    if (!settings) return
    // Ensure a default profile exists for the target game before switching to
    // it, so onboarding steps always operate against a real (possibly empty)
    // profile rather than a null activeProfile.
    await window.api.ensureProfileForGame(target)
    await window.api.setSetting('poeVersion', target)
    setSettings(await window.api.getSettings())
  }

  useEffect(() => {
    window.api.setAppWindowMode(step === 'settings' ? 'settings' : 'onboarding')
  }, [step])

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setSettings(s)
      if (s.onboardingCompleted) {
        goTo('settings')
      } else if (s.onboardingStep) {
        const resumed = resolveResumeStep(s.onboardingStep)
        if (resumed) setStep(resumed)
        if (s.onboardingSelectedGames) setSelectedGames(s.onboardingSelectedGames)
        if (s.onboardingImportedOnline) setImportedOnline(s.onboardingImportedOnline)
      }
    })
    // Re-fetch leagues each time the app window mounts. The cooldown gate in
    // refreshLeagues short-circuits the network call when the launch-time
    // refresh was recent, so this is essentially free on most reopens.
    //
    // The result has to be pulled back by hand: main broadcasts setting updates
    // to every window *except* the sender, and the launch-time refresh runs
    // before any window exists. Without this the settings League row kept
    // rendering the pre-rotation league out of a stale snapshot while the
    // profile on disk had already been migrated. Merge only the keys the
    // refresh can touch so an edit made while it was in flight survives.
    window.api
      .refreshLeagues()
      .then(async () => {
        const fresh = await window.api.getSettings()
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                leaguesPoe1: fresh.leaguesPoe1,
                leaguesPoe2: fresh.leaguesPoe2,
                activeProfile: fresh.activeProfile,
              }
            : fresh,
        )
      })
      .catch(() => {
        /* fail silently -- cached/fallback leagues already render */
      })
    const unsub = window.api.onSettingUpdated((key, value) => {
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    })
    return unsub
  }, [])

  useEffect(() => {
    return window.api.onGameSwitchPrompt((target) => setGameSwitchTarget(target))
  }, [])

  useEffect(() => {
    const onFocus = (): void => {
      if (settings?.onboardingCompleted && step !== 'settings' && !revisitingOnboarding) goTo('settings')
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [settings, step, revisitingOnboarding])

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    if (!settings) return
    window.api.setSetting(key, value)
    setSettings({ ...settings, [key]: value })
  }

  /** Multi-key write in one state update. Two sequential updateSetting calls in
   *  the same tick both spread the same stale `settings`, so the second silently
   *  drops the first key's write. Mirrors SettingsPanel's updateMany. */
  const updateSettings = (patch: Partial<AppSettings>): void => {
    for (const key of Object.keys(patch) as Array<keyof AppSettings>) {
      window.api.setSetting(key, patch[key] as AppSettings[keyof AppSettings])
    }
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const updateProfileSettingForGame = async (game: 1 | 2, key: 'league', value: string): Promise<void> => {
    setSettings(await window.api.setProfileSettingForGame(game, key, value))
  }

  if (!settings) return <div />

  const updateActiveProfileTradeOption = async <K extends 'tradePriceOption'>(
    key: K,
    value: ProfileSettingValue<K>,
  ): Promise<void> => {
    setSettings(await window.api.setProfileSettingForGame(settings.poeVersion ?? 1, key, value))
  }

  const total = totalOnboardingSteps(selectedGames)
  const orderedGames = selectedGameOrder(selectedGames)
  const showGameLabel = orderedGames.length === 2

  const editProfile = async (profile: PoeProfileSummary): Promise<void> => {
    const result = await window.api.setActiveProfile(profile.id)
    if (!result.ok && 'requiresRestart' in result) {
      const confirmed = window.confirm(
        `Editing this PoE${profile.gameVariant} profile requires restarting Scalpel so the overlay can attach to the correct game. Restart now?`,
      )
      if (!confirmed) return
      const restartResult = await window.api.setActiveProfile(profile.id, true)
      if (!restartResult.ok || !('settings' in restartResult)) return
      setSettings(restartResult.settings)
      setSettingsTabRequest((prev) => ({ tab: 'filter', n: (prev?.n ?? 0) + 1 }))
      goTo('settings')
      return
    }
    if (!result.ok) return
    if ('restarting' in result) return
    setSettings(result.settings)
    setSettingsTabRequest((prev) => ({ tab: 'filter', n: (prev?.n ?? 0) + 1 }))
    goTo('settings')
  }

  const startFilterFlowFor = async (game: 1 | 2): Promise<void> => {
    await switchOnboardingGame(game)
    goTo(filterFolderStepFor(game))
  }

  const switchGameThenGoTo = async (game: 1 | 2, next: Step): Promise<void> => {
    await switchOnboardingGame(game)
    goTo(next)
  }

  // Both Done-screen buttons funnel through finish-onboarding so the
  // relaunch-on-game-mismatch check (and the completion-flag writes) happen no
  // matter which exit the user picks. `after` runs only when we're not relaunching
  // -- a mismatch relaunch tears the window down before it could matter.
  const completeOnboarding = async (after: () => void): Promise<void> => {
    setRevisitingOnboarding(false)
    const result = await window.api.finishOnboarding()
    if ('restarting' in result) return
    after()
  }

  return (
    <div className="w-screen h-screen bg-bg-solid flex flex-col overflow-hidden">
      {gameSwitchTarget !== null && (
        <GameSwitchModal
          target={gameSwitchTarget}
          onRestart={() => {
            window.api.respondGameSwitch('restart')
            setGameSwitchTarget(null)
          }}
          onCancel={() => {
            window.api.respondGameSwitch('cancel')
            setGameSwitchTarget(null)
          }}
        />
      )}
      {settings && <AppUpdateBanner platform={settings.platform} />}
      <LinuxDisclaimerBanner platform={settings?.platform} />
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden flex justify-center"
        style={{ marginTop: step !== 'settings' ? -10 : undefined }}
      >
        <div className={`w-full max-w-[480px] px-6 py-8 ${step !== 'settings' ? 'flex flex-col select-none' : ''}`}>
          {step === 'welcome' && (
            <SlideIn stepKey="welcome" direction={direction}>
              <WelcomeStep
                selectedGames={selectedGames}
                onSelectedGamesChange={setSelectedGames}
                onNext={() => {
                  void startFilterFlowFor(orderedGames[0] ?? 1)
                }}
              />
            </SlideIn>
          )}

          {/* Per-game filter setup steps. Each selected game contributes a folder
           *  step, a filter step, and an optional online-filter-setup step. */}
          {orderedGames.map((game) => {
            const folderStep = filterFolderStepFor(game)
            const filterStep = filterStepFor(game)
            const onlineStep = onlineSetupStepFor(game)
            const importedKey = game === 1 ? 'poe1' : 'poe2'
            const importedName = importedOnline[importedKey]
            return (
              <Fragment key={game}>
                {step === folderStep && (
                  <SlideIn stepKey={folderStep} direction={direction}>
                    <FilterFolderStep
                      settings={settings}
                      onSettingsChange={setSettings}
                      onNext={() => goTo(filterStep)}
                      onBack={() => {
                        const back = backStepFromFilterFolder(game, selectedGames, importedOnline)
                        if (game === 2 && selectedGames.poe1) {
                          void switchGameThenGoTo(1, back)
                          return
                        }
                        goTo(back)
                      }}
                      game={showGameLabel ? game : null}
                      stepNum={filterStepNum(selectedGames, game, 'folder')}
                      totalSteps={total}
                    />
                  </SlideIn>
                )}
                {step === filterStep && (
                  <SlideIn stepKey={filterStep} direction={direction}>
                    <FilterStep
                      settings={settings}
                      onSettingsChange={setSettings}
                      onNext={() => {
                        const next = nextStepAfterFilter(game, selectedGames, importedOnline)
                        if (next === 'filter-folder-poe2') {
                          void switchGameThenGoTo(2, next)
                          return
                        }
                        goTo(next)
                      }}
                      onBack={() => goTo(folderStep)}
                      onOnlineImport={(name) => setImportedOnline((prev) => ({ ...prev, [importedKey]: name }))}
                      game={showGameLabel ? game : null}
                      stepNum={filterStepNum(selectedGames, game, 'filter')}
                      totalSteps={total}
                    />
                  </SlideIn>
                )}
                {step === onlineStep && importedName && (
                  <SlideIn stepKey={onlineStep} direction={direction}>
                    <OnlineFilterSetupStep
                      filterName={importedName}
                      onNext={() => {
                        const next = nextStepAfterOnlineSetup(game, selectedGames)
                        if (next === 'filter-folder-poe2') {
                          void switchGameThenGoTo(2, next)
                          return
                        }
                        goTo(next)
                      }}
                      onBack={() => {
                        setImportedOnline((prev) => ({ ...prev, [importedKey]: null }))
                        goTo(filterStep)
                      }}
                    />
                  </SlideIn>
                )}
              </Fragment>
            )
          })}

          {step === 'hotkey' && (
            <SlideIn stepKey="hotkey" direction={direction}>
              <HotkeyStep
                settings={settings}
                onUpdate={updateSetting}
                onNext={() => goTo('trade')}
                onBack={() => goTo(backStepFromHotkey(selectedGames, importedOnline))}
                stepNum={sharedStepNum(selectedGames, 'hotkey')}
                totalSteps={total}
                showWasdTip={selectedGames.poe2}
              />
            </SlideIn>
          )}
          {step === 'trade' && (
            <SlideIn stepKey="trade" direction={direction}>
              <TradeStep
                settings={settings}
                onUpdate={updateSetting}
                onProfileUpdate={updateActiveProfileTradeOption}
                onNext={() => goTo('preferences')}
                onBack={() => goTo('hotkey')}
                stepNum={sharedStepNum(selectedGames, 'trade')}
                totalSteps={total}
                showWasdTip={selectedGames.poe2}
              />
            </SlideIn>
          )}
          {step === 'preferences' && (
            <SlideIn stepKey="preferences" direction={direction}>
              <PreferencesStep
                settings={settings}
                selectedGames={selectedGames}
                onUpdate={updateSetting}
                onProfileUpdateForGame={updateProfileSettingForGame}
                onNext={() => goTo('plugins')}
                onBack={() => goTo('trade')}
                stepNum={sharedStepNum(selectedGames, 'preferences')}
                totalSteps={total}
              />
            </SlideIn>
          )}
          {step === 'plugins' && (
            <SlideIn stepKey="plugins" direction={direction}>
              <PluginsStep
                onNext={() => goTo('macros')}
                onBack={() => goTo('preferences')}
                stepNum={sharedStepNum(selectedGames, 'plugins')}
                totalSteps={total}
              />
            </SlideIn>
          )}
          {step === 'macros' && (
            <SlideIn stepKey="macros" direction={direction}>
              <MacrosStep
                settings={settings}
                onUpdate={updateSetting}
                onUpdateMany={updateSettings}
                onNext={() => goTo('done')}
                onBack={() => goTo('plugins')}
                stepNum={sharedStepNum(selectedGames, 'macros')}
                totalSteps={total}
              />
            </SlideIn>
          )}
          {step === 'done' && (
            <SlideIn stepKey="done" direction={direction}>
              <DoneStep
                onOpenSettings={() => void completeOnboarding(() => goTo('settings'))}
                onCloseWindow={() =>
                  void completeOnboarding(() => {
                    // Leave the view on settings before hiding so reopening from
                    // the tray doesn't strand the user on the onboarding "done" page.
                    goTo('settings')
                    window.close()
                  })
                }
              />
            </SlideIn>
          )}
          {step === 'settings' && (
            <PoeVersionProvider version={settings?.poeVersion ?? null}>
              <AppSettingsWrapper
                settings={settings}
                onSettingsChange={setSettings}
                tabRequest={settingsTabRequest}
                onShowOnboarding={() => {
                  setRevisitingOnboarding(true)
                  goTo('welcome')
                }}
                onEditProfile={(profile) => {
                  void editProfile(profile)
                }}
              />
            </PoeVersionProvider>
          )}
        </div>
      </div>
    </div>
  )
}
