import type { OverlayData } from '../../../shared/types'

interface UpdateBannerProps {
  updateVersion: string | null
  updateProgress: number | null
  updateReady: boolean
  justUpdated: string | null
  needsElevation: boolean
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
  view,
  overlayData,
  priceCheckData,
  onSaveAndInstall,
  onDownloadUpdate,
}: UpdateBannerProps): JSX.Element {
  return (
    <>
      {/* Update banner */}
      {updateVersion && (
        <div className="relative flex items-center justify-between px-3.5 py-2 text-[11px] overflow-hidden shrink-0 bg-[rgba(255,183,77,0.24)]">
          {/* Progress fill */}
          {(updateProgress !== null || updateReady) && (
            <div
              className="absolute top-0 left-0 bottom-0 transition-all duration-300 ease-linear"
              style={{
                width: `${updateReady ? 100 : updateProgress}%`,
                background: updateReady ? 'rgba(76,175,80,0.25)' : 'rgba(76,175,80,0.15)',
              }}
            />
          )}
          <span className="text-text font-semibold relative z-[1]">
            {updateReady
              ? `Scalpel Update Ready (v${updateVersion}) - restart to apply`
              : updateProgress !== null
                ? `Downloading v${updateVersion}... ${updateProgress}%`
                : `Scalpel Update Available (v${updateVersion})`}
          </span>
          <div className="relative z-[1]">
            {updateReady ? (
              <button
                onClick={() => onSaveAndInstall({ view, overlayData, priceCheckData })}
                className="px-3 py-1 text-[11px] font-semibold border-none rounded cursor-pointer bg-[#4caf50] text-white"
              >
                Restart
              </button>
            ) : updateProgress === null ? (
              <button
                onClick={onDownloadUpdate}
                className="px-3 py-1 text-[11px] font-semibold bg-accent text-bg-solid border-none rounded cursor-pointer"
              >
                Update
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Just updated banner */}
      {justUpdated && (
        <div className="flex items-center justify-center px-3.5 py-1.5 text-[11px] shrink-0 bg-[rgba(76,175,80,0.2)]">
          <span className="text-text font-semibold">Updated to v{justUpdated}</span>
        </div>
      )}

      {/* Elevation warning */}
      {needsElevation && (
        <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] shrink-0 gap-2 bg-[rgba(239,83,80,0.15)]">
          <span className="font-semibold text-[#ef5350]">
            Can't read items. If PoE is running as admin, Scalpel needs to be too.
          </span>
        </div>
      )}
    </>
  )
}
