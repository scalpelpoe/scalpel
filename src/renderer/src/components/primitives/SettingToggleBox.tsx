import { Toggle } from '../Toggle'

/**
 * Settings-row toggle styled to match `SettingSelectBox` so they line up in a
 * grid. Yes/No label on the left, Toggle on the right.
 */
export function SettingToggleBox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}): JSX.Element {
  return (
    <section>
      <label>{label}</label>
      <div className="setting-box mt-[2px] min-h-[40px]" onClick={() => onChange(!checked)} role="button">
        <span className="value">{checked ? 'Yes' : 'No'}</span>
        {/* Stop click bubbling so we don't fire onChange twice when the user clicks the toggle. */}
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle checked={checked} onChange={onChange} />
        </div>
      </div>
    </section>
  )
}
