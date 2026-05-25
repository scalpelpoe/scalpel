import { useState } from 'react'
import type { RuntimeSettings } from '../../../shared/types'
import { OnlineFilterModal } from '../components/OnlineFilterModal'
import { SettingsPanel } from '../components/SettingsPanel'

export function AppSettingsWrapper({
  settings,
  onSettingsChange,
  onManageProfiles,
}: {
  settings: RuntimeSettings
  onSettingsChange: (s: RuntimeSettings) => void
  onManageProfiles: () => void
}): JSX.Element {
  const [onlineImportName, setOnlineImportName] = useState<string | null>(null)

  return (
    <>
      <SettingsPanel
        settings={settings}
        onSettingsChange={onSettingsChange}
        mode="app"
        onManageProfiles={onManageProfiles}
        onOnlineImport={setOnlineImportName}
      />
      {onlineImportName && (
        <OnlineFilterModal filterName={onlineImportName} onDismiss={() => setOnlineImportName(null)} />
      )}
    </>
  )
}
