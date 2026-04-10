export function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}): JSX.Element {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      className="w-7 h-4 rounded-lg relative transition-[background] duration-150 shrink-0"
      style={{
        background: checked ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      <div
        className="w-3 h-3 rounded-full bg-white absolute top-0.5 transition-[left] duration-150"
        style={{
          left: checked ? 14 : 2,
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  )
}
