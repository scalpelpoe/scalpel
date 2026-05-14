import { useEffect, useState } from 'react'
import type { RegistryEntry, RegistrySnapshot } from '../../../../shared/plugin-registry-types'
import type { PluginManifest } from '../../../../plugin-sdk/src/types'
import { Button } from '../primitives/Button'

interface Props {
  onError: (msg: string, tone?: 'error' | 'warn') => void
}

interface InstalledRow {
  manifest: PluginManifest
}

export function PluginsSection({ onError }: Props): JSX.Element {
  const [registry, setRegistry] = useState<RegistrySnapshot | null>(null)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [installed, setInstalled] = useState<InstalledRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const refreshInstalled = async (): Promise<void> => {
    const list = await window.api.listInstalledPlugins()
    setInstalled(list.map((p) => ({ manifest: p.manifest })))
  }

  const refreshRegistry = async (): Promise<void> => {
    const r = await window.api.pluginFetchRegistry()
    if (r.ok) {
      setRegistry(r.snapshot)
      setRegistryError(null)
    } else {
      setRegistry(null)
      setRegistryError(r.error)
    }
  }

  useEffect(() => {
    void refreshInstalled()
    void refreshRegistry()
  }, [])

  const isInstalled = (id: string): boolean => installed.some((i) => i.manifest.id === id)

  const install = async (entry: RegistryEntry): Promise<void> => {
    setBusyId(entry.id)
    const r = await window.api.pluginInstallFromRegistry(entry)
    setBusyId(null)
    if (!r.ok) {
      onError(`Install failed: ${r.error}`)
      return
    }
    onError(`Installed "${entry.name}".`, 'warn')
    void refreshInstalled()
  }

  const uninstall = async (pluginId: string, name: string): Promise<void> => {
    setBusyId(pluginId)
    const r = await window.api.pluginUninstall(pluginId)
    setBusyId(null)
    if (!r.ok) {
      onError(`Uninstall failed: ${r.error}`)
      return
    }
    onError(`Uninstalled "${name}".`, 'warn')
    void refreshInstalled()
  }

  const browseEntries = (registry?.plugins ?? []).filter((e) => !isInstalled(e.id))

  return (
    <div className="flex flex-col gap-4 p-3">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Installed</span>
          <button onClick={() => void refreshInstalled()} className="text-[11px] text-text-dim hover:text-text">
            Refresh
          </button>
        </div>
        {installed.length === 0 ? (
          <div className="text-xs text-zinc-500">No plugins installed.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {installed.map(({ manifest }) => (
              <div key={manifest.id} className="flex items-center gap-2 bg-black/15 rounded p-[6px]">
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">
                    <strong>{manifest.name}</strong> <span className="text-zinc-500">v{manifest.version}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">by {manifest.author}</div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busyId === manifest.id}
                  onClick={() => void uninstall(manifest.id, manifest.name)}
                >
                  Uninstall
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Browse</span>
          <button onClick={() => void refreshRegistry()} className="text-[11px] text-text-dim hover:text-text">
            Refresh
          </button>
        </div>
        {registryError ? (
          <div className="text-xs text-red-400">Registry unavailable: {registryError}</div>
        ) : !registry ? (
          <div className="text-xs text-zinc-500">Loading...</div>
        ) : browseEntries.length === 0 ? (
          <div className="text-xs text-zinc-500">All registry plugins are already installed.</div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {browseEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 bg-black/15 rounded p-[6px]">
                <div className="flex-1 min-w-0">
                  <div className="text-xs">
                    <strong>{entry.name}</strong> <span className="text-zinc-500">v{entry.latestVersion}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500">by {entry.author}</div>
                  <div className="text-[11px] mt-1">{entry.description}</div>
                </div>
                <div className="self-start">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busyId === entry.id}
                    onClick={() => void install(entry)}
                  >
                    {busyId === entry.id ? 'Installing...' : 'Install'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
