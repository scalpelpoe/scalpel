import type { PlatformBanner } from '@shared/contracts/platform-settings'
import { PlatformSettingNoticeView } from './platform-notices'
import { usePlatformSettings } from './platform-settings-store'

/** Neutral top-of-window stack. @scalpel/platform supplies the banners and
 *  their actions; both windows mount this at the same layout position. */
export function PlatformBanners({ enabled }: { enabled: boolean }): JSX.Element | null {
  const payload = usePlatformSettings(enabled)
  if (!enabled || !payload?.banners.length) return null
  return (
    <>
      {payload.banners.map((banner: PlatformBanner) => (
        <PlatformSettingNoticeView
          key={banner.id}
          notice={{
            messageKey: banner.messageKey,
            params: banner.params,
            tone: banner.tone,
            action: banner.action,
          }}
        />
      ))}
    </>
  )
}
