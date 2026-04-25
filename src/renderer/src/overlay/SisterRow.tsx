/** Shared row wrapper for sister overlay lists (price-check + filter-page tier items).
 *  Handles the zebra striping, "current item" highlight + no-click state, and the hover
 *  affordance. Callers provide the inner name/icon/price markup as children. */
interface SisterRowProps {
  /** True when this row represents the item the user is currently looking at -- gets a
   *  brighter static background, no hover effect, onClick suppressed. */
  isCurrent: boolean
  /** Even-index rows get a faint tint; odd rows stay transparent. */
  zebraEven: boolean
  /** Handler fired only when isCurrent is false. */
  onClick?: () => void
  title?: string
  children: React.ReactNode
}

export function SisterRow({ isCurrent, zebraEven, onClick, title, children }: SisterRowProps): JSX.Element {
  return (
    <div
      onClick={isCurrent ? undefined : onClick}
      className={`px-2 py-2 first:pt-5 last:pb-5 flex flex-col gap-1 ${
        isCurrent ? 'cursor-default' : 'cursor-pointer hover:bg-white/[0.07]'
      }`}
      style={{
        background: isCurrent ? 'rgba(255,255,255,0.08)' : zebraEven ? 'rgba(255,255,255,0.02)' : 'transparent',
      }}
      title={title}
    >
      {children}
    </div>
  )
}
