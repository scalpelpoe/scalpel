import { useEffect, useState } from 'react'
import { CloseSmall, Info } from '@icon-park/react'
import type { AppSettings, FilterListEntry } from '../../../shared/types'

interface Props {
  settings: AppSettings
  onSettingsChange: (s: AppSettings) => void
  /** Called when an online filter is imported and the user needs instructions */
  onOnlineImport?: (filterName: string) => void
  /** When true, automatically send /itemfilter command to PoE after importing */
  autoSwitchInGame?: boolean
  /** Show only part of the picker: 'folder' for dir only, 'list' for filter list only, undefined for both */
  mode?: 'folder' | 'list'
  /** Max height of the filter list in px (default 200) */
  maxListHeight?: number
  /** Called when an online filter has been merged/overwritten so parent can clear update state */
  onOnlineFilterUpdated?: (name: string) => void
}

export function FilterPicker({
  settings,
  onSettingsChange,
  onOnlineImport,
  autoSwitchInGame,
  mode,
  maxListHeight = 200,
  onOnlineFilterUpdated,
}: Props): JSX.Element {
  const [filters, setFilters] = useState<FilterListEntry[]>([])
  const [scanning, setScanning] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [conflictEntry, setConflictEntry] = useState<FilterListEntry | null>(null)
  const [updatedFilters, setUpdatedFilters] = useState<Set<string>>(new Set())
  const [merging, setMerging] = useState(false)
  const [mergeResult, setMergeResult] = useState<{
    filterName: string
    stats: {
      unchanged: number
      upstreamOnly: number
      userOnly: number
      bothChanged: number
      added: number
      removed: number
    }
    conflicts: Array<{ description: string; actionType: string }>
  } | null>(null)

  // Listen for online filter changes
  useEffect(() => {
    const unsub = window.api.onOnlineFilterChanged((changed) => {
      setUpdatedFilters((prev) => {
        const next = new Set(prev)
        for (const c of changed) next.add(c.name)
        return next
      })
    })
    return unsub
  }, [])

  const scanDir = async (dir: string): Promise<void> => {
    setScanning(true)
    const list = await window.api.scanFilterDir(dir)
    setFilters(list)
    setScanning(false)
  }

  // Scan on mount if we already have a directory
  useEffect(() => {
    if (settings.filterDir) scanDir(settings.filterDir)
  }, [settings.filterDir])

  const pickDir = async (): Promise<void> => {
    const dir = await window.api.pickFilterDir()
    if (dir) {
      onSettingsChange({ ...settings, filterDir: dir })
    }
  }

  const importOnlineFilter = async (entry: FilterListEntry, force: boolean): Promise<boolean> => {
    const result = await window.api.importOnlineFilter(entry.path, entry.name, settings.filterDir, force)
    if (result.conflict) {
      setConflictEntry(entry)
      return false
    }
    if (!result.ok || !result.path) return false
    onSettingsChange({ ...settings, filterPath: result.path })
    await scanDir(settings.filterDir)
    return true
  }

  const selectFilter = async (entry: FilterListEntry): Promise<void> => {
    let filterName: string
    let freshImport = false

    if (entry.online) {
      const safeName = entry.name.replace(/[<>:"/\\|?*]/g, '_')
      const localName = `${safeName}-local`
      const sep = settings.filterDir.includes('/') ? '/' : '\\'
      const localPath = `${settings.filterDir}${sep}${localName}.filter`

      // Check if local copy already exists by attempting a non-force import
      const result = await window.api.importOnlineFilter(entry.path, entry.name, settings.filterDir, false)
      if (result.conflict) {
        // Local copy exists - switch to it and check for updates
        window.api.setSetting('filterPath', localPath)
        onSettingsChange({ ...settings, filterPath: localPath })
        filterName = localName
        // Trigger update check in the background (same as overlay's "Check for Updates")
        window.api.checkForOnlineUpdate().catch(() => {})
      } else if (result.ok && result.path) {
        // First import - set up the local copy
        onSettingsChange({ ...settings, filterPath: result.path })
        await scanDir(settings.filterDir)
        filterName = localName
        freshImport = true
        if (!autoSwitchInGame) {
          onOnlineImport?.(localName)
          return
        }
      } else {
        return
      }
    } else {
      window.api.setSetting('filterPath', entry.path)
      onSettingsChange({ ...settings, filterPath: entry.path })
      filterName = entry.name
    }

    if (autoSwitchInGame) {
      setSwitching(true)
      const currentFilter =
        freshImport && settings.filterPath
          ? settings.filterPath.replace(/^.*[\\/]/, '').replace(/\.filter$/i, '')
          : undefined
      await window.api.switchIngameFilter(filterName, currentFilter)
      setSwitching(false)
    }
  }

  const mergeOnlineFilter = async (entry: FilterListEntry): Promise<void> => {
    const safeName = entry.name.replace(/[<>:"/\\|?*]/g, '_')
    const localName = `${safeName}-local`
    const localPath = `${settings.filterDir}${settings.filterDir.includes('/') ? '/' : '\\'}${localName}.filter`

    setMerging(true)
    setConflictEntry(null)
    const result = await window.api.mergeOnlineFilter(entry.name, entry.path, localPath)
    setMerging(false)

    if (!result.ok) {
      // Conflicts or error -- fall back to overwrite prompt
      setConflictEntry(entry)
      return
    }

    setUpdatedFilters((prev) => {
      const next = new Set(prev)
      next.delete(entry.name)
      return next
    })
    onOnlineFilterUpdated?.(entry.name)

    if (result.stats) {
      setMergeResult({
        filterName: entry.name,
        stats: result.stats,
        conflicts: result.conflicts ?? [],
      })
    }

    // Reload filter list and switch in game if needed
    await scanDir(settings.filterDir)
    if (autoSwitchInGame) {
      setSwitching(true)
      const currentFilter = settings.filterPath
        ? settings.filterPath.replace(/^.*[\\/]/, '').replace(/\.filter$/i, '')
        : undefined
      await window.api.switchIngameFilter(localName, currentFilter)
      setSwitching(false)
    }
  }

  const confirmOverwrite = async (): Promise<void> => {
    if (!conflictEntry) return
    const entry = conflictEntry
    setConflictEntry(null)
    const imported = await importOnlineFilter(entry, true)
    if (!imported) return
    setUpdatedFilters((prev) => {
      const next = new Set(prev)
      next.delete(entry.name)
      return next
    })
    onOnlineFilterUpdated?.(entry.name)
    const filterName = entry.name.replace(/[<>:"/\\|?*]/g, '_') + '-local'
    if (autoSwitchInGame) {
      setSwitching(true)
      const currentFilter = settings.filterPath
        ? settings.filterPath.replace(/^.*[\\/]/, '').replace(/\.filter$/i, '')
        : undefined
      await window.api.switchIngameFilter(filterName, currentFilter)
      setSwitching(false)
    } else {
      onOnlineImport?.(entry.name)
    }
  }

  const dirName = settings.filterDir ? settings.filterDir.replace(/^.*[\\/]/, '') : null

  const localFilters = filters.filter((f) => !f.online)
  const onlineFilters = filters.filter((f) => f.online)

  const showFolder = mode !== 'list'
  const showList = mode !== 'folder'

  return (
    <div className="flex flex-col gap-2">
      {/* Directory selector */}
      {showFolder && (
        <div className="setting-box" onClick={pickDir}>
          <span className={`value ${dirName ? '' : 'dim'}`}>{dirName ?? '(no folder selected)'}</span>
          <button
            className="primary"
            onClick={(e) => {
              e.stopPropagation()
              pickDir()
            }}
          >
            {dirName ? 'Change' : 'Browse...'}
          </button>
        </div>
      )}

      {/* Filter list */}
      {showList && settings.filterDir && !scanning && filters.length > 0 && (
        <div
          className="flex flex-col gap-0.5 overflow-y-auto rounded p-1 bg-black/20"
          style={{
            maxHeight: maxListHeight,
          }}
        >
          {localFilters.length > 0 &&
            localFilters.map((f) => (
              <FilterRow
                key={f.path}
                entry={f}
                active={settings.filterPath === f.path}
                switching={switching}
                hasUpdate={false}
                onSelect={() => selectFilter(f)}
              />
            ))}
          {onlineFilters.length > 0 && (
            <>
              <div className="text-[10px] text-text-dim uppercase tracking-[0.5px] px-2 pt-1.5 pb-0.5">
                Online Filters
              </div>
              {onlineFilters.map((f) => (
                <FilterRow
                  key={f.path}
                  entry={f}
                  active={settings.filterPath === f.path}
                  switching={switching}
                  hasUpdate={updatedFilters.has(f.name)}
                  onSelect={() => selectFilter(f)}
                />
              ))}
            </>
          )}
        </div>
      )}

      {showList && settings.filterDir && !scanning && filters.length > 0 && (
        <p className="text-[10px] text-text-dim flex items-center gap-1 m-0 ml-1 mt-0.5">
          <Info size={12} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} className="flex shrink-0" />
          To add a new online filter, load it in-game first and it will appear here next time you open settings.
        </p>
      )}

      {showList && settings.filterDir && !scanning && filters.length === 0 && (
        <p className="text-[11px] text-text-dim m-0">No filter files found in this folder.</p>
      )}

      {showList && scanning && <p className="text-[11px] text-text-dim m-0">Scanning...</p>}

      {showList && conflictEntry && !merging && (
        <div className="p-3 rounded flex flex-col gap-2 bg-[rgba(200,169,110,0.08)]">
          <p className="text-xs text-text m-0">
            <strong>{conflictEntry.name}</strong> has an update available.
          </p>
          <div className="flex gap-2">
            <button className="primary px-3 py-1.5 text-[11px]" onClick={() => mergeOnlineFilter(conflictEntry)}>
              Update
            </button>
            <button onClick={confirmOverwrite} className="px-3 py-1.5 text-[11px]">
              Overwrite
            </button>
            <button onClick={() => setConflictEntry(null)} className="px-3 py-1.5 text-[11px]">
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-text-dim m-0">
            Update applies the new filter version while preserving your Scalpel changes. Overwrite replaces your local
            copy entirely.
          </p>
        </div>
      )}

      {showList && merging && <p className="text-[11px] text-accent m-0">Merging filters...</p>}

      {showList && mergeResult && (
        <div className="p-3 rounded flex flex-col gap-[6px] relative bg-[rgba(76,175,80,0.08)]">
          <button
            onClick={() => setMergeResult(null)}
            className="absolute top-[6px] right-[6px] w-5 h-5 p-0 flex items-center justify-center text-white"
          >
            <CloseSmall size={12} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} className="flex" />
          </button>
          <p className="text-xs text-text m-0 font-semibold">Update complete</p>
          <div className="text-[11px] text-text-dim">
            {(() => {
              const s = mergeResult.stats
              const applied = s.applied ?? s.userOnly + s.bothChanged
              const skipped = s.skipped ?? 0
              return (
                <>
                  {applied > 0 && <div>{applied} Scalpel changes reapplied</div>}
                  {skipped > 0 && <div>{skipped} changes skipped</div>}
                  {applied === 0 && skipped === 0 && <div>Filter updated to latest version</div>}
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

function FilterRow({
  entry,
  active,
  switching,
  hasUpdate,
  onSelect,
}: {
  entry: FilterListEntry
  active: boolean
  switching: boolean
  hasUpdate: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <div
      onClick={switching ? undefined : onSelect}
      className="flex items-center gap-2 rounded-[3px] border-none transition-[background] duration-100 px-2 py-1.5"
      style={{
        cursor: switching ? 'default' : 'pointer',
        background: active ? 'var(--accent-dim)' : 'transparent',
        opacity: switching && !active ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!active && !switching) e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span
        className="flex-1 text-xs font-semibold overflow-hidden text-ellipsis whitespace-nowrap"
        style={{
          color: active ? 'var(--accent)' : 'var(--text)',
        }}
      >
        {!entry.online && entry.name.endsWith('-local') ? (
          <>
            <span className="font-normal" style={{ color: active ? 'var(--accent)' : 'var(--text-dim)' }}>
              (Local)
            </span>{' '}
            {entry.name.slice(0, -'-local'.length)}
          </>
        ) : (
          entry.name
        )}
      </span>
      {hasUpdate && <span className="text-[10px] text-accent shrink-0 font-semibold">Update Detected</span>}
      {entry.online && !active && !switching && !hasUpdate && (
        <span className="text-[10px] text-text-dim shrink-0">Online</span>
      )}
      {active && switching && <span className="text-[10px] text-text-dim shrink-0">Reloading Filters...</span>}
      {active && !switching && <span className="text-[10px] text-accent shrink-0">Active</span>}
    </div>
  )
}
