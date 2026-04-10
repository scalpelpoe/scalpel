import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { SettingsPanel } from '../components/SettingsPanel'
import { OnlineFilterModal } from '../components/OnlineFilterModal'

export function AppSettingsWrapper({
  settings,
  onSettingsChange,
  onShowOnboarding,
}: {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
  onShowOnboarding: () => void
}): JSX.Element {
  const [onlineImportName, setOnlineImportName] = useState<string | null>(null)

  return (
    <>
      <SettingsPanel
        settings={settings}
        onSettingsChange={onSettingsChange}
        mode="app"
        onShowOnboarding={onShowOnboarding}
        onOnlineImport={setOnlineImportName}
      />
      {onlineImportName && (
        <OnlineFilterModal filterName={onlineImportName} onDismiss={() => setOnlineImportName(null)} />
      )}
    </>
  )
}
