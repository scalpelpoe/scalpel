import { useEffect, useState } from 'react'
import type { AppSettings } from '../../shared/types'
import { type Step, STEP_ORDER, TOTAL_ONBOARDING_STEPS } from './app-window/constants'
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

/** Convert a KeyboardEvent into Electron accelerator format */
export function AppWindow(): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [step, setStep] = useState<Step>('welcome')
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [importedOnlineFilter, setImportedOnlineFilter] = useState<string | null>(null)

  const goTo = (next: Step): void => {
    const curIdx = STEP_ORDER.indexOf(step)
    const nextIdx = STEP_ORDER.indexOf(next)
    setDirection(nextIdx >= curIdx ? 'forward' : 'back')
    setStep(next)
  }

  // Notify main process when switching between onboarding and settings
  useEffect(() => {
    window.api.setAppWindowMode(step === 'settings' ? 'settings' : 'onboarding')
  }, [step])

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setSettings(s)
      // If already onboarded, go straight to settings
      if (s.filterPath) goTo('settings')
    })
    const unsub = window.api.onSettingUpdated((key, value) => {
      setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    })
    return unsub
  }, [])

  // When window is re-shown after being hidden, reset to settings if onboarding is done
  useEffect(() => {
    const onFocus = (): void => {
      if (settings?.filterPath && step !== 'settings') goTo('settings')
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [settings, step])

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    if (!settings) return
    window.api.setSetting(key, value)
    setSettings({ ...settings, [key]: value })
  }

  if (!settings) return <div />

  return (
    <div className="w-screen h-screen bg-bg-solid flex flex-col overflow-hidden">
      {/* Content */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden flex justify-center"
        style={{
          alignItems: step !== 'settings' ? 'center' : undefined,
          marginTop: step !== 'settings' ? -10 : undefined,
        }}
      >
        <div className="w-full max-w-[480px] px-6 py-8">
          {step === 'welcome' && (
            <SlideIn stepKey="welcome" direction={direction}>
              <WelcomeStep onNext={() => goTo('filter-folder')} />
            </SlideIn>
          )}
          {step === 'filter-folder' && (
            <SlideIn stepKey="filter-folder" direction={direction}>
              <FilterFolderStep settings={settings} onSettingsChange={setSettings} onNext={() => goTo('filter')} />
            </SlideIn>
          )}
          {step === 'filter' && (
            <SlideIn stepKey="filter" direction={direction}>
              <FilterStep
                settings={settings}
                onSettingsChange={setSettings}
                onNext={() => goTo(importedOnlineFilter ? 'online-filter-setup' : 'hotkey')}
                onBack={() => goTo('filter-folder')}
                onOnlineImport={(name) => setImportedOnlineFilter(name)}
              />
            </SlideIn>
          )}
          {step === 'online-filter-setup' && importedOnlineFilter && (
            <SlideIn stepKey="online-filter-setup" direction={direction}>
              <OnlineFilterSetupStep
                filterName={importedOnlineFilter}
                onNext={() => goTo('hotkey')}
                onBack={() => {
                  setImportedOnlineFilter(null)
                  goTo('filter')
                }}
                stepNum={3}
                totalSteps={TOTAL_ONBOARDING_STEPS + 1}
              />
            </SlideIn>
          )}
          {step === 'hotkey' && (
            <SlideIn stepKey="hotkey" direction={direction}>
              <HotkeyStep
                settings={settings}
                onUpdate={updateSetting}
                onNext={() => goTo('pricecheck-hotkey')}
                onBack={() => goTo('filter')}
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
              />
            </SlideIn>
          )}
          {step === 'trade-login' && (
            <SlideIn stepKey="trade-login" direction={direction}>
              <TradeLoginStep onNext={() => goTo('preferences')} onBack={() => goTo('pricecheck-hotkey')} />
            </SlideIn>
          )}
          {step === 'preferences' && (
            <SlideIn stepKey="preferences" direction={direction}>
              <PreferencesStep
                settings={settings}
                onUpdate={updateSetting}
                onNext={() => goTo('done')}
                onBack={() => goTo('trade-login')}
              />
            </SlideIn>
          )}
          {step === 'done' && (
            <SlideIn stepKey="done" direction={direction}>
              <DoneStep
                onFinish={() => {
                  window.api.finishOnboarding()
                  goTo('settings')
                }}
              />
            </SlideIn>
          )}
          {step === 'settings' && (
            <AppSettingsWrapper
              settings={settings}
              onSettingsChange={setSettings}
              onShowOnboarding={() => goTo('welcome')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// Type augmentation for preload API
declare global {
  interface Window {
    api: import('../../preload/index').Api
  }
}
