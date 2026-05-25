import { Fragment, useEffect, useState } from 'react'
import type { AppSettings, PoeProfileSummary, RuntimeSettings } from '../../shared/types'
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
import { GameSwitchModal } from './components/GameSwitchModal'

type ImportedOnline = { poe1: string | null; poe2: string | null }

export function AppWindow(): JSX.Element {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null)
  const [step, setStep] = useState<Step>('welcome')
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [importedOnline, setImportedOnline] = useState<ImportedOnline>({ poe1: null, poe2: null })
  const [gameSwitchTarget, setGameSwitchTarget] = useState<1 | 2 | null>(null)
  const [selectedGames, setSelectedGames] = useState<SelectedGames>({ poe1: false, poe2: false })
  const [settingsTabRequest, setSettingsTabRequest] = useState<{ tab: string; n: number } | null>(null)

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
        setStep((s.onboardingStep === 'profiles' ? 'welcome' : s.onboardingStep) as Step)
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
      if (settings?.onboardingCompleted && step !== 'settings') goTo('settings')
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [settings, step])

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    if (!settings) return
    window.api.setSetting(key, value)
    setSettings({ ...settings, [key]: value })
  }

  const updateProfileSettingForGame = async (game: 1 | 2, key: 'league', value: string): Promise<void> => {
    setSettings(await window.api.setProfileSettingForGame(game, key, value))
  }

  if (!settings) return <div />

  const total = totalOnboardingSteps(selectedGames)
  const sharedBase = sharedStepBase(selectedGames)
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
                      stepNum={filterStepNum(selectedGames, game, 'filter') + 1}
                      totalSteps={total + 1}
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
                onNext={() => goTo('done')}
                onBack={() => goTo('trade-login')}
                stepNum={sharedBase + 4}
                totalSteps={total}
              />
            </SlideIn>
          )}
          {step === 'done' && (
            <SlideIn stepKey="done" direction={direction}>
              <DoneStep
                onFinish={() => {
                  window.api.setSetting('onboardingCompleted', true)
                  window.api.setSetting('onboardingStep', '')
                  goTo('settings')
                }}
              />
            </SlideIn>
          )}
          {step === 'settings' && (
            <AppSettingsWrapper
              settings={settings}
              onSettingsChange={setSettings}
              tabRequest={settingsTabRequest}
              onEditProfile={(profile) => {
                void editProfile(profile)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
