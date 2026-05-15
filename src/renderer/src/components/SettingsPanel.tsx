import { useEffect, useState } from 'react'
import type { AppSettings, PoeItem } from '../../../shared/types'
import {
  GeneralTab,
  ViewTab,
  MacrosTab,
  FilterTab,
  PriceCheckTab,
  FaqTab,
  CheatSheetsTab,
  prettyHotkey,
} from './settings'
import { DeveloperSection } from './settings/DeveloperSection'
import { PluginsSection } from './settings/PluginsSection'
import { ErrorBanner } from './ErrorBanner'
import { findHotkeyCollision, type HotkeySlot } from './settings/hotkey-collisions'
import { usePoeVersion } from '../shared/poe-version-context'

interface Props {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
  mode: 'overlay' | 'app'
  onDone?: () => void
  onOnlineFilterUpdated?: (name: string) => void
  onOnlineImport?: (name: string) => void
  onShowOnboarding?: () => void
  /** Item currently loaded in the overlay, used to preserve context when undoing/restoring */
  currentItem?: PoeItem
  /** Optional callback to show a short banner at the top of the overlay */
  onError?: (message: string, tone?: 'error' | 'warn') => void
  /** External request to focus a specific tab (e.g. cheat-sheet overlay's
   *  "Open Sheet Settings" button). The counter bumps on each request so a
   *  re-request to the same tab still re-applies. */
  tabRequest?: { tab: string; n: number } | null
}

/** Hotkeys PoE itself uses - warn (don't block) when the user binds one of these. */
const POE_PROTECTED_HOTKEYS = new Set(['CommandOrControl+F', 'CommandOrControl+Alt+C'])

const TAB_KEYS = [
  'general',
  'view',
  'macros',
  'cheatsheets',
  'filter',
  'pricecheck',
  'plugins',
  'faq',
  'developer',
] as const
type TabKey = (typeof TAB_KEYS)[number]
const TAB_LABELS: Record<TabKey, string> = {
  general: 'General',
  view: 'View',
  macros: 'Macros',
  cheatsheets: 'Sheets',
  filter: 'Filter',
  pricecheck: 'Trade',
  plugins: 'Plugins',
  faq: 'FAQ',
  developer: 'Developer',
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  mode,
  onDone: _onDone,
  onOnlineFilterUpdated,
  onOnlineImport,
  onShowOnboarding,
  currentItem,
  onError,
  tabRequest,
}: Props): JSX.Element {
  const currentGame = usePoeVersion()
  // Use the initial tab request as the seed if present, so the first-mount
  // case (panel created in response to "Open Sheet Settings") lands on the
  // right tab without waiting for an effect.
  const [tab, setTab] = useState<TabKey>(() => {
    const t = tabRequest?.tab
    return t && (TAB_KEYS as readonly string[]).includes(t) ? (t as TabKey) : 'general'
  })
  const [localError, setLocalError] = useState<string | null>(null)
  const [localErrorTone, setLocalErrorTone] = useState<'error' | 'warn'>('error')

  // Reapply the tab whenever a *new* request arrives (counter bumped). Skips
  // the initial mount since useState above already consumed the seed.
  useEffect(() => {
    if (!tabRequest) return
    if ((TAB_KEYS as readonly string[]).includes(tabRequest.tab)) setTab(tabRequest.tab as TabKey)
  }, [tabRequest?.n])

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]): void => {
    window.api.setSetting(key, value)
    onSettingsChange({ ...settings, [key]: value })
  }

  const showError = (msg: string, tone: 'error' | 'warn' = 'error'): void => {
    if (onError) {
      onError(msg, tone)
    } else {
      setLocalError(msg)
      setLocalErrorTone(tone)
      setTimeout(() => setLocalError(null), tone === 'warn' ? 5000 : 3000)
    }
  }

  /** Check if a hotkey collides or is a PoE-reserved combo. Collisions block; warnings pass. */
  const tryHotkey = (hotkey: string, slot: HotkeySlot): boolean => {
    const collisionLabel = findHotkeyCollision(settings, hotkey, slot, currentGame)
    if (collisionLabel) {
      showError(`Hotkey already in use for ${collisionLabel}`)
      return false
    }
    if (POE_PROTECTED_HOTKEYS.has(hotkey)) {
      showError(`PoE uses ${prettyHotkey(hotkey)} so using it isn't recommended but I'm not your dad`, 'warn')
    }
    return true
  }

  const isOverlay = mode === 'overlay'

  return (
    <div className={`flex flex-col ${isOverlay ? 'gap-5 bg-bg-card rounded p-4 pb-5' : 'gap-6 pb-[18px]'} relative`}>
      {/* Local error banner (only shown when no onError handler lifts it out) */}
      {!onError && <ErrorBanner message={localError} tone={localErrorTone} />}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2">
          <h2
            className="section-title"
            style={!isOverlay ? { color: 'var(--accent)', fontSize: 16, fontWeight: 700 } : undefined}
          >
            Settings
          </h2>
          <span className="text-[9px] text-accent opacity-60">Beta {__APP_VERSION__}</span>
        </div>
        <div className="flex flex-wrap gap-[6px]">
          {(TAB_KEYS as readonly TabKey[])
            .filter((t) => t !== 'developer' || settings.developerMode)
            .map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[11px] px-3 py-1.5 ${tab === t ? 'bg-accent text-bg-solid' : 'text-text-dim'}`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          {!isOverlay && onShowOnboarding && (
            <button onClick={onShowOnboarding} className="text-[11px] text-text-dim px-3 py-1.5">
              Setup Wizard
            </button>
          )}
        </div>
      </div>

      {tab === 'general' && <GeneralTab settings={settings} update={update} />}
      {tab === 'view' && <ViewTab settings={settings} update={update} />}
      {tab === 'macros' && <MacrosTab settings={settings} update={update} tryHotkey={tryHotkey} />}
      {tab === 'cheatsheets' && (
        <CheatSheetsTab settings={settings} update={update} tryHotkey={tryHotkey} onError={showError} />
      )}
      {tab === 'filter' && (
        <FilterTab
          settings={settings}
          update={update}
          isOverlay={isOverlay}
          onOnlineFilterUpdated={onOnlineFilterUpdated}
          onOnlineImport={onOnlineImport}
          onSettingsChange={onSettingsChange}
          tryHotkey={tryHotkey}
          currentItem={currentItem}
        />
      )}
      {tab === 'pricecheck' && <PriceCheckTab settings={settings} update={update} tryHotkey={tryHotkey} />}
      {tab === 'plugins' && <PluginsSection onError={showError} />}
      {tab === 'faq' && <FaqTab />}
      {tab === 'developer' && <DeveloperSection settings={settings} update={update} onError={showError} />}
    </div>
  )
}
