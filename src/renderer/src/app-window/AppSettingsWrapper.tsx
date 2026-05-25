import { useState } from 'react'
import type { PoeProfileSummary, RuntimeSettings } from '../../../shared/types'
import { OnlineFilterModal } from '../components/OnlineFilterModal'
import { SettingsPanel } from '../components/SettingsPanel'

export function AppSettingsWrapper({
  settings,
  onSettingsChange,
  onEditProfile,
  tabRequest,
}: {
  settings: RuntimeSettings
  onSettingsChange: (s: RuntimeSettings) => void
  onEditProfile: (profile: PoeProfileSummary) => void
  tabRequest?: { tab: string; n: number } | null
}): JSX.Element {
  const [onlineImportName, setOnlineImportName] = useState<string | null>(null)

  return (
    <>
      <SettingsPanel
        settings={settings}
        onSettingsChange={onSettingsChange}
        mode="app"
        onEditProfile={onEditProfile}
        onOnlineImport={setOnlineImportName}
        tabRequest={tabRequest}
      />
      {onlineImportName && (
        <OnlineFilterModal filterName={onlineImportName} onDismiss={() => setOnlineImportName(null)} />
      )}
    </>
  )
}
