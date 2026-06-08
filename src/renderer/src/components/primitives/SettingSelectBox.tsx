/**
 * Settings-row dropdown styled to match the other `.setting-box` rows (hotkey, trade site
 * login, etc.). Renders a label, the currently-selected value, a "Change" button, and a
 * transparent native `<select>` overlaid so the OS dropdown is what actually opens.
 */
export function SettingSelectBox<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (v: T) => void
}): JSX.Element {
  const current = options.find((o) => o.value === value) ?? options[0]
  // Stable DOM id per-mount so the button's click target is unique when multiple of these
  // render on the same tab.
  const id = `setting-select-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <section>
      <label>{label}</label>
      <div className="setting-box mt-[2px] relative">
        <span className="value">{current?.label ?? ''}</span>
        <button
          className="primary"
          onClick={() => {
            const sel = document.getElementById(id) as HTMLSelectElement | null
            sel?.showPicker?.()
            sel?.focus()
          }}
        >
          Change
        </button>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  )
}
