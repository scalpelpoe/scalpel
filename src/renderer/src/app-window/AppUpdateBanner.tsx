import { useEffect, useRef, useState } from 'react'
import { BrickedReleaseBanner, JustUpdatedBanner, UpdateAvailableBanner } from '../shared/update-banners'

/**
 * Top-of-window update + bricked-release banners for the app (settings) window.
 * Reuses the shared banner primitives; wires its own state since the app window has no
 * overlay context (view/overlayData/priceCheckData) to preserve across restart.
 */
export function AppUpdateBanner(): JSX.Element | null {
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [justUpdated, setJustUpdated] = useState<string | null>(null)
  const [brickedRelease, setBrickedRelease] = useState<{ version: string; message: string | null } | null>(null)

  const justUpdatedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Pull current state on mount so a late-opening window still sees what's already fired.
    window.api.getUpdateState().then((s) => {
      setUpdateVersion(s.updateVersion)
      setUpdateReady(s.updateReady)
      setBrickedRelease(s.brickedRelease)
    })
    const unsubs = [
      window.api.onUpdateAvailable((v) => setUpdateVersion(v)),
      window.api.onUpdateDownloadProgress((p) => setUpdateProgress(p)),
      window.api.onUpdateDownloaded(() => {
        setUpdateProgress(null)
        setUpdateReady(true)
      }),
      window.api.onUpdateRescinded(() => {
        setUpdateVersion(null)
        setUpdateProgress(null)
        setUpdateReady(false)
      }),
      window.api.onUpdateApplied((v) => {
        setJustUpdated(v)
        if (justUpdatedTimer.current) clearTimeout(justUpdatedTimer.current)
        justUpdatedTimer.current = setTimeout(() => setJustUpdated(null), 4000)
      }),
      window.api.onBrickedRelease((info) => setBrickedRelease(info)),
    ]
    return () => {
      for (const unsub of unsubs) unsub()
      if (justUpdatedTimer.current) clearTimeout(justUpdatedTimer.current)
    }
  }, [])

  if (!updateVersion && !justUpdated && !brickedRelease) return null

  return (
    <>
      {/* Update banner -- suppressed when a bricked-release advisory is active, since
          auto-update is the mechanism we're telling the user can't work for them. */}
      {updateVersion && !brickedRelease && (
        <UpdateAvailableBanner
          version={updateVersion}
          progress={updateProgress}
          ready={updateReady}
          onDownload={() => {
            setUpdateProgress(0)
            window.api.downloadUpdate()
          }}
          onRestart={() => window.api.installUpdate()}
        />
      )}
      {justUpdated && <JustUpdatedBanner version={justUpdated} />}
      {brickedRelease && <BrickedReleaseBanner version={brickedRelease.version} message={brickedRelease.message} />}
    </>
  )
}
