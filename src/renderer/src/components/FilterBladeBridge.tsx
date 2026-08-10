import { useEffect, useMemo, useState } from 'react'
import type { GameVariant, RuntimeSettings } from '@shared/types'
import { filterBladeUrl as filterBladeUrlFor, poeItemFilterLadderUrl, poeItemFilterUrl } from '@shared/endpoints'

interface Props {
  settings: RuntimeSettings
  onSettingsChange: (s: RuntimeSettings) => void
  autoSwitchInGame?: boolean
  onOnlineImport?: (filterName: string) => void
  onLinked?: () => void
}

function onlineNameFromLocalPath(filterPath: string): string | null {
  const base = filterPath.replace(/^.*[\\/]/, '').replace(/\.filter$/i, '')
  if (!base.endsWith('-local')) return null
  return base.slice(0, -'-local'.length) || null
}

function poeFilterIdFromPath(onlinePath: string): string | null {
  const id = onlinePath
    .replace(/^.*[\\/]/, '')
    .replace(/\.filter$/i, '')
    .trim()
  return id || null
}

export function FilterBladeBridge({
  settings,
  onSettingsChange,
  autoSwitchInGame,
  onOnlineImport,
  onLinked,
}: Props): JSX.Element {
  const gameVariant = (settings.poeVersion === 2 ? 2 : 1) as GameVariant
  const fDir = settings.activeProfile?.filterDir ?? ''
  const fPath = settings.activeProfile?.filterPath ?? ''
  const linkedLocal = Boolean(fPath && /[/\\][^/\\]+-local\.filter$/i.test(fPath))
  const linkedOnlineName = fPath ? onlineNameFromLocalPath(fPath) : null

  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Array<{ name: string; path: string; score: number }>>([])
  const [preferName, setPreferName] = useState('')

  const refreshCandidates = async (dir?: string): Promise<void> => {
    if (!window.api.filterBladeScan) return
    const scan = await window.api.filterBladeScan(dir ?? (fDir || undefined))
    setCandidates(scan.candidates)
    setPreferName((prev) => {
      if (prev && scan.candidates.some((c) => c.name === prev)) return prev
      if (linkedOnlineName && scan.candidates.some((c) => c.name === linkedOnlineName)) {
        return linkedOnlineName
      }
      return scan.candidates[0]?.name ?? ''
    })
  }

  useEffect(() => {
    void refreshCandidates()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fDir, settings.poeVersion, linkedOnlineName])

  const selected = useMemo(() => {
    if (!candidates.length) return null
    return (
      candidates.find((c) => c.name === preferName) ||
      (linkedOnlineName ? candidates.find((c) => c.name === linkedOnlineName) : null) ||
      candidates[0]
    )
  }, [candidates, preferName, linkedOnlineName])

  const selectedFilterId = selected ? poeFilterIdFromPath(selected.path) : null

  const openPoeFilterPage = (): void => {
    if (selectedFilterId) {
      void window.api.openExternal(poeItemFilterUrl(selectedFilterId))
      return
    }
    // No OnlineFilters yet — send them to the public ladder to Follow a shared filter.
    void window.api.openExternal(poeItemFilterLadderUrl(gameVariant))
  }

  const openFilterBlade = async (): Promise<void> => {
    const url = (window.api.filterBladeUrl && (await window.api.filterBladeUrl())) || filterBladeUrlFor(gameVariant)
    void window.api.openExternal(url)
  }

  const scanAndLink = async (force = false): Promise<void> => {
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const result = await window.api.filterBladeLink({
        filterDir: fDir || undefined,
        preferName: preferName || undefined,
        force,
      })
      if (result.filterDir && result.filterDir !== fDir) {
        const updated = await window.api.setProfileSettingForGame(gameVariant, 'filterDir', result.filterDir)
        onSettingsChange(updated)
      }
      if (result.candidates) setCandidates(result.candidates)

      if (!result.ok) {
        setError(result.error ?? 'Could not link online filter')
        return
      }
      if (!result.path || !result.localName) {
        setError('Link succeeded but no local path was returned')
        return
      }

      const updated = await window.api.setProfileSettingForGame(gameVariant, 'filterPath', result.path)
      onSettingsChange(updated)

      if (result.alreadyLinked) {
        setStatus(`Already linked to “${result.onlineName}”. Checking for online updates…`)
        window.api.checkForOnlineUpdate().catch(() => {})
      } else {
        setStatus(`Linked “${result.onlineName}” → ${result.localName}.filter`)
        if (!autoSwitchInGame) onOnlineImport?.(result.localName)
      }

      if (autoSwitchInGame) {
        const currentFilter = fPath ? fPath.replace(/^.*[\\/]/, '').replace(/\.filter$/i, '') : undefined
        await window.api.switchIngameFilter(result.localName, currentFilter)
      }

      onLinked?.()
      await refreshCandidates(result.filterDir)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-text m-0">Online / shared filters</div>
          <p className="text-[11px] text-text-dim m-0 mt-1 leading-relaxed">
            Follow a shared filter on pathofexile.com (or Sync from FilterBlade), select it in-game once, then link
            here. Scalpel edits a local copy and can pull updates later.
          </p>
        </div>
      </div>

      <ol className="m-0 pl-4 text-[11px] text-text-dim leading-relaxed space-y-0.5">
        <li>Open the PoE filter page (or Follow from a player&apos;s shared filters)</li>
        <li>Select that filter once in-game (downloads into OnlineFilters)</li>
        <li>
          Scan &amp; Link below — use the linked <span className="font-mono text-text">*-local</span> filter in PoE
        </li>
      </ol>

      <div className="flex flex-wrap gap-2 mt-1">
        <button type="button" className="primary px-2.5 py-1 text-[11px]" onClick={openPoeFilterPage}>
          {selectedFilterId ? `Open “${selected?.name ?? 'filter'}” on PoE` : 'Browse PoE filter ladder'}
        </button>
        <button type="button" className="px-2.5 py-1 text-[11px]" onClick={() => void openFilterBlade()}>
          Open FilterBlade
        </button>
        <button
          type="button"
          className="px-2.5 py-1 text-[11px]"
          disabled={busy}
          onClick={() => void scanAndLink(false)}
        >
          {busy ? 'Linking…' : linkedLocal ? 'Re-scan & Link' : 'Scan & Link'}
        </button>
        {linkedLocal && (
          <button
            type="button"
            className="px-2.5 py-1 text-[11px]"
            disabled={busy}
            onClick={() => {
              setStatus('Asking PoE to re-download the online filter…')
              window.api.checkForOnlineUpdate().catch((e) => setError(String(e)))
            }}
          >
            Check online updates
          </button>
        )}
      </div>

      {candidates.length > 1 && (
        <label className="flex flex-col gap-1 text-[11px] text-text-dim">
          Online filter to link
          <select
            className="bg-[#12131a] text-text border border-white/12 rounded px-2 py-1 text-[11px]"
            value={preferName}
            onChange={(e) => setPreferName(e.target.value)}
          >
            {candidates.map((c) => (
              <option key={c.path} value={c.name}>
                {c.name}
                {c.score >= 5 ? ' · NeverSink?' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      {candidates.length === 1 && <p className="text-[10px] text-text-dim m-0">Found online: {candidates[0].name}</p>}
      {candidates.length === 0 && (
        <p className="text-[10px] text-text-dim m-0">
          No OnlineFilters yet — Follow a shared filter on pathofexile.com (or Sync from FilterBlade) and select it
          in-game first.
        </p>
      )}

      {status && <p className="text-[11px] text-accent m-0">{status}</p>}
      {error && <p className="text-[11px] text-red-400 m-0">{error}</p>}
    </div>
  )
}
