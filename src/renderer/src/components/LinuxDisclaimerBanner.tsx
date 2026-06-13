import { ErrorBanner } from './ErrorBanner'

export function LinuxDisclaimerBanner({ platform }: { platform: NodeJS.Platform | undefined }): JSX.Element | null {
  if (platform !== 'linux') return null
  return (
    <ErrorBanner
      tone="warn"
      inline
      message="Linux support is best-effort. Overlay and input hooks may be unstable under Wayland, some compositors, and tiling window managers. Tested primarily on GNOME and Hyprland."
    />
  )
}
