import { Fragment, useEffect, useState } from 'react'
import type { AppSettings, PoeProfileSummary } from '../../shared/types'
import { type Step, STEP_ORDER, type SelectedGames, totalOnboardingSteps } from './app-window/constants'
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
  sharedStepBase,
} from './app-window/onboarding-nav'
import { SlideIn } from './app-window/SlideIn'
import {
  WelcomeStep,
  FilterFolderStep,
  FilterStep,
  OnlineFilterSetupStep,
  HotkeyStep,
  PriceCheckHotkeyStep,
  TradeLoginStep,
  PreferencesStep,
  DoneStep,
} from './app-window/onboarding-steps'
import { AppSettingsWrapper } from './app-window/AppSettingsWrapper'
import { AppUpdateBanner } from './app-window/AppUpdateBanner'
import { ProfileManagerStep } from './app-window/ProfileManagerStep'
import { GameSwitchModal } from './components/GameSwitchModal'

type ImportedOnline = { poe1: string | null; poe2: string | null }

export function AppWindow(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [step, setStep] = useState<Step>('profiles')
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [importedOnline, setImportedOnline] = useState<ImportedOnline>({ poe1: null, poe2: null })
  const [gameSwitchTarget, setGameSwitchTarget] = useState<1 | 2 | null>(null)
  const [selectedGames, setSelectedGames] = useState<SelectedGames>({ poe1: false, poe2: false })
  // Set when the user opens Manage Profiles from settings so the focus-bounce
  // effect below doesn't yank them back to settings on every focus event.
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

  const switchOnboardingGame = async (target: 1 | 2): Promise<void> => {
    if (!settings) return
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
        setStep((s.onboardingStep === 'welcome' ? 'profiles' : s.onboardingStep) as Step)
        if (s.onboardingSelectedGames) setSelectedGames(s.onboardingSelectedGames)
        if (s.onboardingImportedOnline) setImportedOnline(s.onboardingImportedOnline)
      }
    })
    // Re-fetch leagues each time the app window mounts. The cooldown gate in
    // refreshLeagues short-circuits the network call when the launch-time
    // refresh was recent, so this is essentially free on most reopens.
    window.api.refreshLeagues().catch(() => {
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

  if (!settings) return <div />

  const showBackToSettings = revisitingOnboarding
  const onBackToSettings = (): void => {
    setRevisitingOnboarding(false)
    goTo('settings')
  }

  const total = totalOnboardingSteps(selectedGames)
  const sharedBase = sharedStepBase(selectedGames)
  const orderedGames = selectedGameOrder(selectedGames)
  const showGameLabel = orderedGames.length === 2

  const finishProfileManager = (): void => {
    window.api.setSetting('onboardingCompleted', true)
    window.api.setSetting('onboardingStep', '')
    setRevisitingOnboarding(false)
    goTo('settings')
  }

  const editProfile = async (profile: PoeProfileSummary): Promise<void> => {
    const nextGames = { poe1: profile.gameVariant === 1, poe2: profile.gameVariant === 2 }
    setSettings(await window.api.setActiveProfile(profile.id))
    setSelectedGames(nextGames)
    goTo(filterFolderStepFor(profile.gameVariant), nextGames)
  }

  const startFilterFlowFor = async (game: 1 | 2): Promise<void> => {
    await switchOnboardingGame(game)
    goTo(filterFolderStepFor(game))
  }

  const switchGameThenGoTo = async (game: 1 | 2, next: Step): Promise<void> => {
    await switchOnboardingGame(game)
    goTo(next)
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
      <AppUpdateBanner />
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden flex justify-center"
        style={{
          alignItems: step !== 'settings' ? 'center' : undefined,
          marginTop: step !== 'settings' ? -10 : undefined,
        }}
      >
        <div className={`w-full max-w-[480px] px-6 py-8 ${step !== 'settings' ? 'select-none' : ''}`}>
          {step === 'profiles' && (
            <SlideIn stepKey="profiles" direction={direction}>
              <ProfileManagerStep
                settings={settings}
                onSettingsChange={setSettings}
                onEditProfile={(profile) => {
                  void editProfile(profile)
                }}
                onFinish={finishProfileManager}
              />
            </SlideIn>
          )}
          {step === 'welcome' && (
            <SlideIn stepKey="welcome" direction={direction}>
              <WelcomeStep
                selectedGames={selectedGames}
                onSelectedGamesChange={setSelectedGames}
                onNext={() => {
                  void startFilterFlowFor(orderedGames[0] ?? 1)
                }}
                onBackToSettings={showBackToSettings ? onBackToSettings : undefined}
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
                      onBackToSettings={showBackToSettings ? onBackToSettings : undefined}
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
                      onBackToSettings={showBackToSettings ? onBackToSettings : undefined}
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
                      stepNum={filterStepNum(selectedGames, game, 'filter') + 1}
                      totalSteps={total + 1}
                      onBackToSettings={showBackToSettings ? onBackToSettings : undefined}
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
                onNext={() => goTo('pricecheck-hotkey')}
                onBack={() => goTo(backStepFromHotkey(selectedGames, importedOnline))}
                stepNum={sharedBase + 1}
                totalSteps={total}
                onBackToSettings={showBackToSettings ? onBackToSettings : undefined}
              />
            </SlideIn>
          )}
          {step === 'pricecheck-hotkey' && (
            <SlideIn stepKey="pricecheck-hotkey" direction={direction}>
              <PriceCheckHotkeyStep
                settings={settings}
                onUpdate={updateSetting}
                onNext={() => goTo('trade-login')}
                onBack={() => goTo('hotkey')}
                stepNum={sharedBase + 2}
                totalSteps={total}
                onBackToSettings={showBackToSettings ? onBackToSettings : undefined}
              />
            </SlideIn>
          )}
          {step === 'trade-login' && (
            <SlideIn stepKey="trade-login" direction={direction}>
              <TradeLoginStep
                onNext={() => goTo('preferences')}
                onBack={() => goTo('pricecheck-hotkey')}
                stepNum={sharedBase + 3}
                totalSteps={total}
                onBackToSettings={showBackToSettings ? onBackToSettings : undefined}
              />
            </SlideIn>
          )}
          {step === 'preferences' && (
            <SlideIn stepKey="preferences" direction={direction}>
              <PreferencesStep
                settings={settings}
                selectedGames={selectedGames}
                onUpdate={updateSetting}
                onNext={() => goTo('done')}
                onBack={() => goTo('trade-login')}
                stepNum={sharedBase + 4}
                totalSteps={total}
                onBackToSettings={showBackToSettings ? onBackToSettings : undefined}
              />
            </SlideIn>
          )}
          {step === 'done' && (
            <SlideIn stepKey="done" direction={direction}>
              <DoneStep
                onFinish={() => {
                  window.api.setSetting('onboardingCompleted', true)
                  window.api.setSetting('onboardingStep', '')
                  setRevisitingOnboarding(false)
                  goTo('settings')
                }}
              />
            </SlideIn>
          )}
          {step === 'settings' && (
            <AppSettingsWrapper
              settings={settings}
              onSettingsChange={setSettings}
              onManageProfiles={() => {
                setRevisitingOnboarding(true)
                goTo('profiles')
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
