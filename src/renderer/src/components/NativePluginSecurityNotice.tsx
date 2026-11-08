import { m } from '@shared/paraglide/messages.js'

export function NativePluginSecurityNotice({ className = '' }: { className?: string }): JSX.Element {
  return (
    <div className={`rounded-[10px] border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 ${className}`} role="note">
      <div className="text-xs font-semibold text-amber-200">{m.settings_plg_native_warning_title()}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-amber-100/75">{m.settings_plg_native_warning_body()}</div>
    </div>
  )
}
