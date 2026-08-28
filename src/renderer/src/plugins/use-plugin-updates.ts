import { useCallback, useEffect, useState } from 'react'
import { outdatedPluginIds } from './plugin-update-check'

/** Out-of-date plugin count for the Plugins-tab badge. Registry mutations need
 * a restart, so the installed graph is recomputed when that state changes. */
export function usePluginUpdates(): number {
  const [count, setCount] = useState(0)

  const recompute = useCallback(async (): Promise<void> => {
    const [installed, reg] = await Promise.all([window.api.listInstalledPlugins(), window.api.pluginFetchRegistry()])
    const snapshot = reg.ok ? reg.snapshot : null
    setCount(outdatedPluginIds(snapshot, installed).size)
  }, [])

  useEffect(() => {
    void recompute()
    const offRestart = window.api.onPluginRestartRequired(() => void recompute())
    return () => {
      offRestart()
    }
  }, [recompute])

  return count
}
