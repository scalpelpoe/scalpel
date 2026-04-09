interface Props {
  filterName: string
  onDismiss: () => void
}

export function OnlineFilterModal({ filterName, onDismiss }: Props): JSX.Element {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-[1000]" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        className="bg-bg-card border border-border rounded p-6 flex flex-col gap-4"
        style={{ maxWidth: 420, width: '90%' }}
      >
        <h3 className="text-accent text-sm font-bold m-0">One more step</h3>

        <p className="text-xs text-text m-0 leading-normal">
          <strong>{filterName}.filter</strong> has been copied to your filter folder. You now need to select it in Path
          of Exile:
        </p>

        <ol className="text-xs text-text-dim m-0 pl-5" style={{ lineHeight: 1.8 }}>
          <li>Open PoE Settings</li>
          <li>
            Go to <strong className="text-text">Game</strong> tab
          </li>
          <li>
            Under <strong className="text-text">Filters</strong>, select{' '}
            <strong className="text-accent">{filterName}</strong> from the dropdown
          </li>
        </ol>

        {/* Placeholder for screenshot */}
        <div
          className="border border-dashed border-border rounded text-center text-text-dim text-[11px] p-6"
          style={{ background: 'rgba(0,0,0,0.2)' }}
        >
          [Screenshot placeholder]
        </div>

        <button className="primary self-end" onClick={onDismiss} style={{ padding: '8px 20px' }}>
          Got it
        </button>
      </div>
    </div>
  )
}
