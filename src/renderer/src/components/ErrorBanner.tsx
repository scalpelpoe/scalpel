/**
 * Slide-down banner.
 *
 * Default mode is `absolute` — positions at the top of the first positioned ancestor
 * (parent must be `position: relative`). Pass `inline` for a flow-layout variant that
 * pushes subsequent content down instead of overlapping it.
 *
 * `tone` defaults to 'error' (red); 'warn' renders orange for advisory messages.
 */
export function ErrorBanner({
  message,
  tone = 'error',
  inline = false,
}: {
  message: string | null
  tone?: 'error' | 'warn'
  inline?: boolean
}): JSX.Element {
  const bg = tone === 'warn' ? 'bg-[var(--warn)]' : 'bg-[var(--danger-bg)]'
  const positioning = inline ? '' : 'absolute left-0 right-0 top-0 z-10'
  return (
    <div
      className={`overflow-hidden transition-all duration-200 ${positioning}`}
      style={{
        maxHeight: message ? 32 : 0,
        opacity: message ? 1 : 0,
      }}
    >
      <div className={`${bg} text-white text-[11px] font-semibold px-3 py-[7px] text-center`}>{message}</div>
    </div>
  )
}
