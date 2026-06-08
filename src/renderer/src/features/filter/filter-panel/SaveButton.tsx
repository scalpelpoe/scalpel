interface SaveButtonProps {
  isDirty: boolean
  isSaving: boolean
  isSaved: boolean
  onSave: () => void
  compact?: boolean
}

export function SaveButton({ isDirty, isSaving, isSaved, onSave, compact }: SaveButtonProps): JSX.Element {
  return (
    <button
      onClick={onSave}
      disabled={isSaving || (!isDirty && !isSaved)}
      className="font-bold tracking-[0.5px] rounded border-none shrink-0 self-stretch transition-all duration-150"
      style={{
        padding: compact ? '6px 16px' : '10px 28px',
        fontSize: compact ? 11 : 13,
        cursor: isDirty ? 'pointer' : 'default',
        ...(isSaved
          ? { background: 'var(--match)', color: '#fff' }
          : isDirty
            ? { background: 'var(--accent)', color: '#171821' }
            : { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.15)' }),
        ...(isSaving ? { opacity: 0.6 } : {}),
      }}
    >
      {isSaving ? 'Saving...' : isSaved ? 'Saved' : 'Save'}
    </button>
  )
}
