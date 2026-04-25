/**
 * Card with arbitrary top content + one button pinned to the bottom (so buttons in
 * a side-by-side row always share a horizontal baseline, regardless of how tall
 * each card's top content is). Pass `primary` for the gold accent treatment.
 */
interface TierActionCardProps {
  children: React.ReactNode
  buttonLabel: React.ReactNode
  /** Optional icon pinned to the left edge of the button; label stays centered. */
  leadingIcon?: React.ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}

export function TierActionCard({
  children,
  buttonLabel,
  leadingIcon,
  onClick,
  disabled,
  primary,
}: TierActionCardProps): JSX.Element {
  return (
    <div className="flex-1 bg-black/20 rounded p-[8px_10px] flex flex-col gap-[8px] min-w-0">
      {/* flex-1 fills available vertical space so buttons align across siblings, while
       *  items-center + justify-center + text-center give content both vertical and
       *  horizontal centering regardless of whether it's a single icon row or wrapped text. */}
      <div className="flex-1 flex items-center justify-center text-center">{children}</div>
      {/* Relative container so leadingIcon can be absolute-positioned at the left edge
       *  without participating in the flex centering of the label. */}
      <button
        onClick={onClick}
        disabled={disabled}
        className={`w-full text-[11px] px-3 py-1.5 relative flex items-center justify-center ${primary ? 'primary' : ''}`}
      >
        {leadingIcon && <span className="absolute left-3 flex items-center pointer-events-none">{leadingIcon}</span>}
        <span>{buttonLabel}</span>
      </button>
    </div>
  )
}
