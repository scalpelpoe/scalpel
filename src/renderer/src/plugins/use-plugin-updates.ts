import { useCallback, useEffect, useState } from 'react'
import { outdatedPluginIds } from './plugin-update-check'

/** Out-of-date plugin count for the Plugins-tab badge. Fetches the registry +
 *  installed list, recomputes on plugin install/update/uninstall, so the badge
 *  reflects reality as soon as Settings is open (any tab). */
export function usePluginUpdates(): number {
  const [count, setCount] = useState(0)

  const recompute = useCallback(async (): Promise<void> => {
    const [installed, reg] = await Promise.all([window.api.listInstalledPlugins(), window.api.pluginFetchRegistry()])
    const snapshot = reg.ok ? reg.snapshot : null
    setCount(outdatedPluginIds(snapshot, installed).size)
  }, [])

  useEffect(() => {
    void recompute()
    const offInstalled = window.api.onPluginInstalled(() => void recompute())
    const offUpdated = window.api.onPluginUpdated(() => void recompute())
    const offUninstalled = window.api.onPluginUninstalled(() => void recompute())
    return () => {
      offInstalled()
      offUpdated()
      offUninstalled()
    }
  }, [recompute])

  return count
}
