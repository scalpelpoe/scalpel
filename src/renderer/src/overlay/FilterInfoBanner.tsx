import { useCallback, useEffect, useRef, useState } from 'react'
import { m } from '@shared/paraglide/messages.js'

interface FilterInfoBannerProps {
  filterPath: string
  updatedOnlineFilters: Set<string>
  checkingUpdate: boolean
  updatingFilter: boolean
  mergeMessage: string | null
  onQuickUpdate: () => Promise<{
    ok: boolean
    stats?: { userOnly: number; upstreamOnly: number; bothChanged: number; added: number; removed: number }
  }>
  onCheckForUpdate: () => Promise<void>
  onFilterUpdated: (activeFile: string) => void
  onMergeMessage: (msg: string | null) => void
  onSetUpdatingFilter: (v: boolean) => void
  onSetCheckingUpdate: (v: boolean) => void
}

export function FilterInfoBanner({
  filterPath,
  updatedOnlineFilters,
  checkingUpdate,
  updatingFilter,
  mergeMessage,
  onQuickUpdate,
  onCheckForUpdate,
  onFilterUpdated,
  onMergeMessage,
  onSetUpdatingFilter,
  onSetCheckingUpdate,
}: FilterInfoBannerProps): JSX.Element {
  const mergeMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (mergeMsgTimer.current) clearTimeout(mergeMsgTimer.current)
      if (checkingTimer.current) clearTimeout(checkingTimer.current)
    }
  }, [])

  const [hasOnlineSource, setHasOnlineSource] = useState<boolean | null>(null)
  const recheckSource = useCallback(() => {
    const isLocal = filterPath
      .replace(/^.*[\\/]/, '')
      .replace(/\.filter$/i, '')
      .endsWith('-local')
    if (!isLocal) {
      setHasOnlineSource(null)
      return
    }
    window.api
      .getOnlineSyncStatus()
      .then((r) => setHasOnlineSource(r.hasOnlineSource))
      .catch(() => setHasOnlineSource(null))
  }, [filterPath])
  useEffect(() => {
    recheckSource()
    window.addEventListener('focus', recheckSource)
    return () => window.removeEventListener('focus', recheckSource)
  }, [recheckSource])

  const activeFile = filterPath.replace(/^.*[\\/]/, '').replace(/\.filter$/i, '')
  const isOnlineFilter = activeFile.endsWith('-local')
  const hasUpdate =
    isOnlineFilter &&
    [...updatedOnlineFilters].some((name) => {
      const safeName = name.replace(/[<>:"/\\|?*]/g, '_') + '-local'
      return safeName === activeFile
    })

  return (
    <div className="flex items-center justify-between px-3.5 py-2 border-b border-border text-[11px] bg-bg-solid">
      <span className="text-text-dim truncate">
        {hasUpdate && <span className="text-accent font-semibold mr-1.5">{m.filterbanner_update_available()}</span>}
        {!hasUpdate &&
          (isOnlineFilter ? (
            <strong className="text-text">{activeFile.slice(0, -'-local'.length)}</strong>
          ) : (
            <strong className="text-text">{activeFile}</strong>
          ))}
      </span>
      {isOnlineFilter &&
        (hasUpdate ? (
          <button
            onClick={async () => {
              onSetUpdatingFilter(true)
              const result = await onQuickUpdate()
              onSetUpdatingFilter(false)
              if (result.ok) {
                onFilterUpdated(activeFile)
                const s = result.stats
                const changes = s ? s.userOnly || s.upstreamOnly + s.bothChanged + s.added + s.removed : 0
                onMergeMessage(
                  changes > 0 ? m.filterbanner_changes_reapplied({ changes }) : m.filterbanner_filter_updated(),
                )
                if (mergeMsgTimer.current) clearTimeout(mergeMsgTimer.current)
                mergeMsgTimer.current = setTimeout(() => onMergeMessage(null), 10000)
              }
            }}
            disabled={updatingFilter}
            className="primary"
            style={{
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              flexShrink: 0,
              opacity: updatingFilter ? 0.5 : 1,
            }}
          >
            {updatingFilter ? m.common_updating() : m.common_update()}
          </button>
        ) : mergeMessage ? (
          <span className="text-[11px] text-accent font-semibold shrink-0">{mergeMessage}</span>
        ) : hasOnlineSource === false ? (
          <button
            onClick={recheckSource}
            className="shrink-0 text-[11px] text-text-dim"
            style={{ padding: '4px 12px' }}
            title="Re-check after loading the filter in-game"
          >
            {m.filterbanner_load_online_to_sync({ name: activeFile.slice(0, -'-local'.length) })}
          </button>
        ) : (
          <button
            onClick={async () => {
              onSetCheckingUpdate(true)
              await onCheckForUpdate()
              if (checkingTimer.current) clearTimeout(checkingTimer.current)
              checkingTimer.current = setTimeout(() => onSetCheckingUpdate(false), 2000)
            }}
            disabled={checkingUpdate}
            className="shrink-0 text-[11px]"
            style={{ padding: '4px 12px', opacity: checkingUpdate ? 0.5 : 1 }}
          >
            {checkingUpdate ? m.common_checking() : m.filterbanner_check_for_updates()}
          </button>
        ))}
    </div>
  )
}
