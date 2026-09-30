import type { ReactNode } from 'react'
import logo from '../assets/scalpel-logo.png'
import { ABOUT_URL } from '../config'

/** Scalpel's overlay window (src/renderer/src/secondary-overlay/Chrome.tsx) minus the
 *  Electron window controls: title strip with the logo over the main overlay's panel
 *  background (bg-bg), so a bg-card hero reads darker as it does on the filter tab. */
export function Window({
  title,
  headerEnd,
  footer,
  children,
}: {
  title: string
  headerEnd?: ReactNode
  footer?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <div className="ssv-window flex flex-col min-w-0 min-h-0 bg-bg rounded overflow-hidden border border-border">
      <div className="flex items-center justify-between gap-2 px-2 py-1 border-b border-border bg-bg-solid-translucent shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src={logo} alt="Scalpel" className="w-4 h-4 shrink-0" />
          <span className="text-text text-xs font-semibold truncate">{title}</span>
        </div>
        {headerEnd}
      </div>
      {children}
      {footer && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border shrink-0">{footer}</div>
      )}
    </div>
  )
}

/** "Powered by" goes to an about page, never a download page (Twitch policy). */
export function PoweredBy(): JSX.Element {
  return (
    <a
      className="text-[11px] text-accent no-underline hover:underline whitespace-nowrap ml-auto"
      href={ABOUT_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      Powered by Scalpel ↗
    </a>
  )
}
