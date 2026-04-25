import { GITHUB_RELEASES_PAGE } from '../../../shared/endpoints'

/** Yellow "update available / downloading / ready" banner with inline progress fill. */
export function UpdateAvailableBanner({
  version,
  progress,
  ready,
  onDownload,
  onRestart,
}: {
  version: string
  progress: number | null
  ready: boolean
  onDownload: () => void
  onRestart: () => void
}): JSX.Element {
  return (
    <div className="relative flex items-center justify-between px-3.5 py-2 text-[11px] overflow-hidden shrink-0 bg-[rgba(255,183,77,0.24)]">
      {(progress !== null || ready) && (
        <div
          className="absolute top-0 left-0 bottom-0 transition-all duration-300 ease-linear"
          style={{
            width: `${ready ? 100 : progress}%`,
            background: ready ? 'rgba(76,175,80,0.25)' : 'rgba(76,175,80,0.15)',
          }}
        />
      )}
      <span className="text-text font-semibold relative z-[1]">
        {ready
          ? `Scalpel Update Ready (v${version}) - restart to apply`
          : progress !== null
            ? `Downloading v${version}... ${progress}%`
            : `Scalpel Update Available (v${version})`}
      </span>
      <div className="relative z-[1]">
        {ready ? (
          <button
            onClick={onRestart}
            className="px-3 py-1 text-[11px] font-semibold border-none rounded cursor-pointer bg-[#4caf50] text-white"
          >
            Restart
          </button>
        ) : progress === null ? (
          <button
            onClick={onDownload}
            className="px-3 py-1 text-[11px] font-semibold bg-accent text-bg-solid border-none rounded cursor-pointer"
          >
            Update
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Green post-update confirmation. */
export function JustUpdatedBanner({ version }: { version: string }): JSX.Element {
  return (
    <div className="flex items-center justify-center px-3.5 py-1.5 text-[11px] shrink-0 bg-[rgba(76,175,80,0.2)]">
      <span className="text-text font-semibold">Updated to v{version}</span>
    </div>
  )
}

/** Red "version bricked, fresh install required" advisory. */
export function BrickedReleaseBanner({ version, message }: { version: string; message: string | null }): JSX.Element {
  return (
    <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] shrink-0 gap-2 bg-[rgba(239,83,80,0.15)]">
      <span className="font-semibold text-[#ef5350]">
        {message ?? `This version (v${version}) can't auto-update. Download the latest installer to continue.`}
      </span>
      <button
        onClick={() => window.api.openExternal(GITHUB_RELEASES_PAGE)}
        className="px-3 py-1 text-[11px] font-semibold bg-[#ef5350] text-white border-none rounded cursor-pointer shrink-0"
      >
        Download
      </button>
    </div>
  )
}
