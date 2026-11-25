import type {
  PlatformBannerAction,
  PlatformBannerTone,
  PlatformSettingNotice,
} from '@shared/contracts/platform-settings'
import { platformMessage, resolvePlatformParams } from './platform-messages'
import { refreshPlatformSettings } from './platform-settings-store'

export const PLATFORM_NOTICE_TONE_CLASS: Record<PlatformBannerTone, string> = {
  warn: 'bg-[rgba(255,183,77,0.24)]',
  error: 'bg-[rgba(239,83,80,0.18)]',
  info: 'bg-[rgba(76,175,80,0.16)]',
}

/** Shared by window banners and inline setting notices. The action only uses
 *  generic restart/opaque-setting calls; it never names a platform feature. */
export async function runPlatformSettingAction(action: PlatformBannerAction): Promise<void> {
  if (action.kind === 'restart') {
    window.api.restartApp()
    return
  }
  try {
    await window.api.setPlatformSetting(action.settingId, action.value)
  } catch {
    // The notice is advisory; a failed follow-up simply leaves it visible.
  }
  await refreshPlatformSettings()
}

interface Props {
  notice: PlatformSettingNotice
  compact?: boolean
}

/** Generic renderer for a descriptor-owned notice. `compact` is used directly
 *  under a selector; the default styling is for the top-of-window stack. */
export function PlatformSettingNoticeView({ notice, compact = false }: Props): JSX.Element {
  const action = notice.action
  const tone = notice.tone ?? 'warn'
  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-2 shrink-0 font-semibold text-text ${
        compact ? 'mt-1 px-2 py-1 text-[10px]' : 'px-3.5 py-2 text-[11px]'
      } ${PLATFORM_NOTICE_TONE_CLASS[tone]}`}
    >
      <span>{platformMessage(notice.messageKey, resolvePlatformParams(notice.params))}</span>
      {action && (
        <button
          className={`bg-accent text-bg-solid border-none rounded cursor-pointer shrink-0 ${
            compact ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-[11px]'
          }`}
          onClick={() => void runPlatformSettingAction(action)}
        >
          {platformMessage(action.labelKey)}
        </button>
      )}
    </div>
  )
}
