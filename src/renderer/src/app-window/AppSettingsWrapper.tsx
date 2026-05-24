import { useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { OnlineFilterModal } from '../components/OnlineFilterModal'
import { SettingsPanel } from '../components/SettingsPanel'

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
