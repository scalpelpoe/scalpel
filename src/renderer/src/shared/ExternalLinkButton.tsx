export interface ExternalLinkButtonProps {
  label: string
  title: string
  onClick: () => void
}

/** Pill button used inside the "Open in" InfoChip on the item hero -- one
 *  per external-link target (Wiki, PoEDB). Matches the look of the existing
 *  Dust/DivCards Explore buttons for visual consistency. */
export function ExternalLinkButton({ label, title, onClick }: ExternalLinkButtonProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="text-[9px] font-semibold text-accent border-none rounded-full cursor-pointer px-2 py-[2px] bg-white/[0.08]"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
      }}
      title={title}
    >
      {label}
    </button>
  )
}
