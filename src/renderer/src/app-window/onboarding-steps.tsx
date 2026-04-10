import { useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import poeFilterSettingImg from '../assets/other/poe-filter-setting.png'
import { FilterPicker } from '../components/FilterPicker'
import { Toggle } from '../components/Toggle'
import { keyEventToAccelerator } from '../components/SettingsPanel'
import appIcon from '../../../../resources/icon.png'
import { IconGlow } from '../shared/IconGlow'
import { TOTAL_ONBOARDING_STEPS } from './constants'
import { StepHeader } from './StepHeader'
import { NavButtons } from './NavButtons'

export function WelcomeStep({ onNext }: { onNext: () => void }): JSX.Element {
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
        subtitle="The first ever fourth-party Path of Exile tool. Let's get you set up so you have one more key combo to remember just to play a video game."
      />
      <NavButtons onNext={onNext} nextLabel="Get Started" />
    </div>
  )
}

export function FilterFolderStep({
  settings,
  onSettingsChange,
  onNext,
}: {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
  onNext: () => void
}): JSX.Element {
  return (
    <div>
      <StepHeader
        stepNum={1}
        totalSteps={TOTAL_ONBOARDING_STEPS}
        title="Point to your filter folder"
        subtitle="Choose your Path of Exile filter folder, generally Documents\My Games\Path of Exile, so Scalpel can find your filters."
      />
      <FilterPicker settings={settings} onSettingsChange={onSettingsChange} mode="folder" />
      <NavButtons onNext={onNext} nextDisabled={!settings.filterDir} />
    </div>
  )
}

export function FilterStep({
  settings,
  onSettingsChange,
  onNext,
  onBack,
  onOnlineImport,
}: {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
  onNext: () => void
  onBack: () => void
  onOnlineImport?: (name: string) => void
}): JSX.Element {
  return (
    <div>
      <StepHeader
        stepNum={2}
        totalSteps={TOTAL_ONBOARDING_STEPS}
        title="Select your filter"
        subtitle="Pick your starting filter. If you select an online filter, it will be resaved locally for fast editing, and you can merge in changes from your online filter whenever there are updates."
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
      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!settings.filterPath} />
    </div>
  )
}

export function OnlineFilterSetupStep({
  filterName,
  onNext,
  onBack,
  stepNum,
  totalSteps,
}: {
  filterName: string
  onNext: () => void
  onBack: () => void
  stepNum?: number
  totalSteps?: number
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

      <NavButtons onNext={onNext} onBack={onBack} nextLabel="Done" />
    </div>
  )
}

export function HotkeyStep({
  settings,
  onUpdate,
  onNext,
  onBack,
}: {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onNext: () => void
  onBack: () => void
}): JSX.Element {
  const [recording, setRecording] = useState(false)
  const recRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const acc = keyEventToAccelerator(e)
      if (!acc) return
      onUpdate('hotkey', acc)
      setRecording(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording, onUpdate])

  useEffect(() => {
    if (!recording) return
    const handler = (e: MouseEvent): void => {
      if (recRef.current && !recRef.current.contains(e.target as Node)) setRecording(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [recording])

  return (
    <div>
      <StepHeader
        stepNum={3}
        totalSteps={TOTAL_ONBOARDING_STEPS}
        title="Set your filter hotkey"
        subtitle="This key combo activates the overlay while you're in game. Hover an item and press it to analyze your filter."
      />
      <div ref={recRef}>
        <div className="setting-box" onClick={() => setRecording(true)}>
          <span className={`value ${recording ? 'recording' : ''}`}>
            {recording ? 'Press your desired key combo...' : settings.hotkey || '(none set)'}
          </span>
          {!recording && (
            <button
              className="primary"
              onClick={(e) => {
                e.stopPropagation()
                setRecording(true)
              }}
            >
              Change
            </button>
          )}
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  )
}

export function PriceCheckHotkeyStep({
  settings,
  onUpdate,
  onNext,
  onBack,
}: {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onNext: () => void
  onBack: () => void
}): JSX.Element {
  const [recording, setRecording] = useState(false)
  const recRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const acc = keyEventToAccelerator(e)
      if (!acc) return
      onUpdate('priceCheckHotkey', acc)
      setRecording(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording, onUpdate])

  useEffect(() => {
    if (!recording) return
    const handler = (e: MouseEvent): void => {
      if (recRef.current && !recRef.current.contains(e.target as Node)) setRecording(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [recording])

  return (
    <div>
      <StepHeader
        stepNum={4}
        totalSteps={TOTAL_ONBOARDING_STEPS}
        title="Set your price check hotkey"
        subtitle="This key combo is used to... price check items. You should know how to use this one."
      />
      <div ref={recRef}>
        <div className="setting-box" onClick={() => setRecording(true)}>
          <span className={`value ${recording ? 'recording' : ''}`}>
            {recording ? 'Press your desired key combo...' : settings.priceCheckHotkey || '(none set)'}
          </span>
          {!recording && (
            <button
              className="primary"
              onClick={(e) => {
                e.stopPropagation()
                setRecording(true)
              }}
            >
              Change
            </button>
          )}
        </div>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  )
}

export function TradeLoginStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }): JSX.Element {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    window.api.poeCheckAuth().then((r) => setLoggedIn(r.loggedIn))
  }, [])

  const checkAuth = (): void => {
    window.api.poeCheckAuth().then((r) => setLoggedIn(r.loggedIn))
  }

  return (
    <div>
      <StepHeader
        stepNum={5}
        totalSteps={TOTAL_ONBOARDING_STEPS}
        title="Log into the trade site"
        subtitle="This is optional, but logging in lets you travel directly to a seller's hideout to buy items from within Scalpel."
      />
      <div className="setting-box mb-6">
        {loggedIn === null ? (
          <span className="value text-text-dim">Checking...</span>
        ) : loggedIn ? (
          <>
            <span className="value text-accent">Logged in</span>
            <button
              className="primary"
              onClick={() => {
                window.api.poeLogout().then(() => setLoggedIn(false))
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
                window.api.poeLogin().then(() => setTimeout(checkAuth, 2000))
              }}
            >
              Login
            </button>
          </>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={onNext} nextLabel={loggedIn ? 'Continue' : 'Skip'} />
    </div>
  )
}

export function PreferencesStep({
  settings,
  onUpdate,
  onNext,
  onBack,
}: {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onNext: () => void
  onBack: () => void
}): JSX.Element {
  return (
    <div>
      <StepHeader
        stepNum={5}
        totalSteps={TOTAL_ONBOARDING_STEPS}
        title="Preferences"
        subtitle="You can always change these later from settings."
      />
      <div className="flex flex-col gap-5">
        {/* League */}
        <section>
          <label>League</label>
          <div className="setting-box mt-[6px] relative">
            <span className="value">{settings.league}</span>
            <button
              className="primary"
              onClick={() => {
                const sel = document.getElementById('league-select-onboarding') as HTMLSelectElement | null
                sel?.showPicker?.()
                sel?.focus()
              }}
            >
              Change
            </button>
            <select
              id="league-select-onboarding"
              value={settings.league}
              onChange={(e) => onUpdate('league', e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            >
              {['Mirage', 'Hardcore Mirage', 'Standard', 'Hardcore'].map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Close on click outside */}
        <section>
          <div
            onClick={() => onUpdate('closeOnClickOutside', !settings.closeOnClickOutside)}
            className="flex items-center gap-[10px] cursor-pointer select-none"
          >
            <Toggle checked={settings.closeOnClickOutside} onChange={(val) => onUpdate('closeOnClickOutside', val)} />
            <span className="text-xs text-text">Close overlay when clicking outside</span>
          </div>
        </section>

        {/* Reload on save */}
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
      <NavButtons onBack={onBack} onNext={onNext} nextLabel="Finish" />
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
