import type { OverlayData } from '../../../shared/types'
import { UpdateAvailableBanner, JustUpdatedBanner, BrickedReleaseBanner } from '../shared/update-banners'

interface UpdateBannerProps {
  updateVersion: string | null
  updateProgress: number | null
  updateReady: boolean
  justUpdated: string | null
  needsElevation: boolean
  brickedRelease: { version: string; message: string | null } | null
  view: string
  overlayData: OverlayData | null
  priceCheckData: unknown
  onSaveAndInstall: (state: { view: string; overlayData: OverlayData | null; priceCheckData: unknown }) => void
  onDownloadUpdate: () => void
}

export function UpdateBanner({
  updateVersion,
  updateProgress,
  updateReady,
  justUpdated,
  needsElevation,
  brickedRelease,
  view,
  overlayData,
  priceCheckData,
  onSaveAndInstall,
  onDownloadUpdate,
}: UpdateBannerProps): JSX.Element {
  return (
    <>
      {/* Update banner -- suppressed when a bricked-release advisory is active, since
          auto-update is the mechanism we're telling the user can't work for them. */}
      {updateVersion && !brickedRelease && (
        <UpdateAvailableBanner
          version={updateVersion}
          progress={updateProgress}
          ready={updateReady}
          onDownload={onDownloadUpdate}
          onRestart={() => onSaveAndInstall({ view, overlayData, priceCheckData })}
        />
      )}

      {justUpdated && <JustUpdatedBanner version={justUpdated} />}

      {needsElevation && (
        <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] shrink-0 gap-2 bg-[rgba(239,83,80,0.15)]">
          <span className="font-semibold text-[#ef5350]">
            Can't read items. If PoE is running as admin, Scalpel needs to be too.
          </span>
        </div>
      )}

      {brickedRelease && <BrickedReleaseBanner version={brickedRelease.version} message={brickedRelease.message} />}
    </>
  )
}
