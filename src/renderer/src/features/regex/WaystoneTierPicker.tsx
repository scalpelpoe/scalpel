export function WaystoneTierPicker({
  onPick,
  searching,
}: {
  onPick: (tier: number) => void
  searching: boolean
}): JSX.Element {
  return (
    <div className="px-3 py-[8px]" style={{ background: 'var(--bg-solid)' }}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-text mb-2">
        {searching ? 'Searching...' : 'Buy waystone - pick tier'}
      </div>
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: 16 }, (_, i) => i + 1).map((t) => (
          <button
            key={t}
            type="button"
            disabled={searching}
            onClick={() => onPick(t)}
            className="text-[11px] py-[6px] border-none cursor-pointer disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text)', borderRadius: 3 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            }}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
