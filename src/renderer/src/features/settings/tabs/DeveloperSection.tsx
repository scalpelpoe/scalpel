import { useCallback, useEffect, useState } from 'react'
import type { PluginManifest } from '../../../../../plugin-sdk/src/types'
import type { AppSettings } from '@shared/types'
import { m } from '@shared/paraglide/messages.js'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onError: (msg: string, tone?: 'error' | 'warn') => void
}

interface UnpackedRow {
  manifest: PluginManifest
  sourceDir?: string
}

export function DeveloperSection({ settings, update, onError }: Props): JSX.Element {
  const enabled = !!settings.developerMode

  const [unpacked, setUnpacked] = useState<UnpackedRow[]>([])

  const refresh = useCallback(async () => {
    const list = await window.api.listUnpackedPlugins()
    setUnpacked(list.map((p) => ({ manifest: p.manifest, sourceDir: p.sourceDir })))
  }, [])

  useEffect(() => {
    void refresh()
    const unsubInstalled = window.api.onPluginInstalled(() => void refresh())
    // A reload re-installs over the running plugin, which reports as an update.
    const unsubUpdated = window.api.onPluginUpdated(() => void refresh())
    const unsubUninstalled = window.api.onPluginUninstalled(() => void refresh())
    return () => {
      unsubInstalled()
      unsubUpdated()
      unsubUninstalled()
    }
  }, [refresh])

  const installPlugin = async (): Promise<void> => {
    const r = await window.api.pluginInstallUnpacked()
    if (!r.ok) {
      if (r.error !== 'cancelled') onError(r.error)
      return
    }
    onError(m.settings_dev_plugin_installed({ id: r.id }), 'warn')
  }

  const reload = async (id: string, name: string): Promise<void> => {
    const r = await window.api.pluginReloadUnpacked(id)
    if (!r.ok) {
      onError(r.error)
      return
    }
    onError(`Reloaded "${name}".`, 'warn')
  }

  const remove = async (id: string, name: string): Promise<void> => {
    const r = await window.api.pluginUninstall(id)
    if (!r.ok) {
      onError(r.error)
      return
    }
    onError(`Removed "${name}".`, 'warn')
    void refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-sm">{m.settings_dev_mode()}</span>
          <span className="text-[10px] text-zinc-500">{m.settings_dev_mode_desc()}</span>
        </div>
        <button
          onClick={() => update('developerMode', !enabled)}
          className={
            (enabled ? 'bg-accent text-[#171821]' : 'bg-zinc-700 text-zinc-200') +
            ' btn-bounce px-3 py-1 text-xs rounded'
          }
        >
          {enabled ? m.common_on() : m.common_off()}
        </button>
      </div>
      {enabled && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border">
          <div className="text-xs text-zinc-400">{m.settings_dev_load_unpacked_desc()}</div>
          <button
            onClick={installPlugin}
            className="btn-bounce self-start px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            {m.settings_dev_load_unpacked()}
          </button>
          <div className="flex flex-col gap-1 mt-1">
            <span className="text-xs text-zinc-400">Loaded unpacked plugins</span>
            <span className="text-[10px] text-zinc-500">
              Reload re-copies the plugin from the directory you loaded it from and swaps the running code - rebuild,
              reload, no restart. Removing only deletes Scalpel's copy; your source directory is untouched.
            </span>
            {unpacked.length === 0 ? (
              <span className="text-xs text-zinc-500">None loaded.</span>
            ) : (
              <div className="flex flex-col gap-1">
                {unpacked.map(({ manifest, sourceDir }) => (
                  <div
                    key={manifest.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white/[0.04]"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="text-xs text-zinc-200">
                        {manifest.name} <span className="font-mono text-[10px] text-zinc-500">v{manifest.version}</span>
                      </span>
                      {sourceDir && (
                        <span className="font-mono text-[10px] text-zinc-500 truncate" title={sourceDir}>
                          {sourceDir}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      <button
                        className="btn-bounce px-2 py-1 text-[11px] bg-zinc-700 hover:bg-zinc-600 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={!sourceDir}
                        title={
                          sourceDir
                            ? `Re-copy from ${sourceDir} and hot-swap the running plugin`
                            : 'Load this plugin unpacked again to enable reloading'
                        }
                        onClick={() => void reload(manifest.id, manifest.name)}
                      >
                        Reload
                      </button>
                      <button
                        className="btn-bounce px-2 py-1 text-[11px] bg-zinc-700 hover:bg-zinc-600 rounded"
                        onClick={() => void remove(manifest.id, manifest.name)}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1 mt-3 pt-3 border-t border-border">
            <span className="text-xs text-zinc-400">Restart Scalpel</span>
            <span className="text-[10px] text-zinc-500">
              Relaunches the app. Rebuilt plugin code no longer needs this - use Reload above - but a full restart still
              clears anything that only initialises at startup. Packaged builds only.
            </span>
            <button
              onClick={() => window.api.restartApp()}
              className="btn-bounce self-start px-3 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded mt-1"
            >
              Restart now
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
