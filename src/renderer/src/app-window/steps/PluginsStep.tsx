import { useEffect, useState } from 'react'
import type { RegistryEntry } from '@shared/plugin-registry-types'
import { Button } from '@renderer/components/primitives/Button'
import { ErrorBanner } from '@renderer/components/ErrorBanner'
import { partitionFeatured } from '@renderer/plugins/featured'
import { m } from '@shared/paraglide/messages.js'
import { NavButtons } from '../NavButtons'
import { StepHeader } from '../StepHeader'
import { useStepError } from '../use-step-error'

function PluginRow({
  entry,
  installed,
  busy,
  showScreenshot,
  onInstall,
}: {
  entry: RegistryEntry
  installed: boolean
  busy: boolean
  /** Featured rows lead with one screenshot. Every row showing one would make
   *  the step several screens tall for no gain -- the point is to make the
   *  promoted plugins legible, not to build a second store page. */
  showScreenshot: boolean
  onInstall: () => void
}): JSX.Element {
  const shot = showScreenshot ? entry.screenshots?.[0] : undefined
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-[10px] bg-white/[0.04]">
      <div className="grid grid-cols-[40px_1fr_auto] gap-3 items-center">
        {entry.iconUrl ? (
          <img src={entry.iconUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-full grid place-items-center bg-accent/20 text-accent font-bold text-[15px]">
            {entry.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-text truncate">{entry.name}</div>
          <div className="text-[11px] text-text-dim truncate">{m.settings_plg_by({ author: entry.author })}</div>
        </div>
        {installed ? (
          <span className="text-[11px] text-accent shrink-0">{m.onb_plugins_installed()}</span>
        ) : (
          <Button variant="primary" size="sm" disabled={busy} onClick={onInstall}>
            {busy ? m.settings_plg_installing() : m.settings_plg_install()}
          </Button>
        )}
      </div>
      <div className="text-[11.5px] text-text-dim">{entry.description}</div>
      {shot && <img src={shot} alt="" className="w-full rounded border border-border" />}
    </div>
  )
}

export function PluginsStep({
  onNext,
  onBack,
  stepNum,
  totalSteps,
  onBackToSettings,
}: {
  onNext: () => void
  onBack: () => void
  stepNum: number
  totalSteps: number
  onBackToSettings?: () => void
}): JSX.Element {
  const [entries, setEntries] = useState<RegistryEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [installedIds, setInstalledIds] = useState<string[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [restartRequired, setRestartRequired] = useState(false)
  const { error, tone, showError } = useStepError()

  useEffect(() => {
    void window.api.pluginFetchRegistry().then((r) => {
      if (r.ok) setEntries(r.snapshot.plugins)
      else setFailed(true)
    })
    void window.api.listInstalledPlugins().then((list) => setInstalledIds(list.map((p) => p.manifest.id)))
  }, [])

  const install = async (entry: RegistryEntry): Promise<void> => {
    setBusyId(entry.id)
    const result = await window.api.pluginInstallFromRegistry(entry)
    setBusyId(null)
    if (result.ok) {
      setInstalledIds((prev) => [...prev, entry.id])
      setRestartRequired(result.restartRequired)
    } else showError(m.settings_plg_install_failed({ error: result.error }))
  }

  const { featured, rest } = partitionFeatured(entries ?? [])

  const nav = (
    <NavButtons
      onBack={onBack}
      onNext={onNext}
      secondaryLabel={m.onb_skip_for_now()}
      onSecondary={onNext}
      onBackToSettings={onBackToSettings}
    />
  )

  const header = (
    <StepHeader
      stepNum={stepNum}
      totalSteps={totalSteps}
      title={m.onb_plugins_title()}
      subtitle={m.onb_plugins_subtitle()}
    />
  )

  // Deliberately no auto-advance on failure. The Macros step's Back lands here,
  // so a step that forwards itself would make everything before it unreachable.
  if (failed || (entries !== null && entries.length === 0)) {
    return (
      <div>
        {header}
        <div className="text-xs text-zinc-500">{failed ? m.onb_plugins_unavailable() : m.onb_plugins_empty()}</div>
        {nav}
      </div>
    )
  }

  if (entries === null) {
    return (
      <div>
        {header}
        <div className="text-xs text-zinc-500">{m.common_loading()}</div>
        {nav}
      </div>
    )
  }

  return (
    <div>
      <ErrorBanner message={error} tone={tone} inline />
      {restartRequired && (
        <div className="mb-3 rounded border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
          Restart Scalpel after setup to activate newly installed plugins. The current plugin graph is unchanged.
        </div>
      )}
      {header}
      <div className="flex flex-col gap-4">
        {featured.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="settings-section-title">{m.onb_plugins_featured()}</div>
            <div className="flex flex-col gap-1">
              {featured.map((entry) => (
                <PluginRow
                  key={entry.id}
                  entry={entry}
                  installed={installedIds.includes(entry.id)}
                  busy={busyId === entry.id}
                  showScreenshot
                  onInstall={() => void install(entry)}
                />
              ))}
            </div>
          </section>
        )}
        {rest.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="settings-section-title">{m.onb_plugins_more()}</div>
            <div className="flex flex-col gap-1">
              {rest.map((entry) => (
                <PluginRow
                  key={entry.id}
                  entry={entry}
                  installed={installedIds.includes(entry.id)}
                  busy={busyId === entry.id}
                  showScreenshot={false}
                  onInstall={() => void install(entry)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
      {nav}
    </div>
  )
}
