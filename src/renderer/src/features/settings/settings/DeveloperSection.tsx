import { useCallback, useEffect, useState } from 'react'
import type { PluginManifest } from '../../../../../plugin-sdk/src/types'
import type { AppSettings } from '../../../../../shared/types'
import { m } from '../../../../../shared/paraglide/messages.js'

interface Props {
  settings: AppSettings
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void
  onError: (msg: string, tone?: 'error' | 'warn') => void
}

export function DeveloperSection({ settings, update, onError }: Props): JSX.Element {
  const enabled = !!settings.developerMode

  const [unpacked, setUnpacked] = useState<PluginManifest[]>([])

  const refresh = useCallback(async () => {
    const list = await window.api.listUnpackedPlugins()
    setUnpacked(list.map((p) => p.manifest))
  }, [])

  useEffect(() => {
    void refresh()
    const unsubInstalled = window.api.onPluginInstalled(() => void refresh())
    const unsubUninstalled = window.api.onPluginUninstalled(() => void refresh())
    return () => {
      unsubInstalled()
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
              Removing only deletes Scalpel's copy. Your source directory is untouched.
            </span>
            {unpacked.length === 0 ? (
              <span className="text-xs text-zinc-500">None loaded.</span>
            ) : (
              <div className="flex flex-col gap-1">
                {unpacked.map((manifest) => (
                  <div
                    key={manifest.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white/[0.04]"
                  >
                    <span className="text-xs text-zinc-200">
                      {manifest.name} <span className="font-mono text-[10px] text-zinc-500">v{manifest.version}</span>
                    </span>
                    <button
                      className="btn-bounce px-2 py-1 text-[11px] bg-zinc-700 hover:bg-zinc-600 rounded"
                      onClick={() => void remove(manifest.id, manifest.name)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
