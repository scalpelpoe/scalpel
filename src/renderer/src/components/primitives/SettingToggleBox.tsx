import { Toggle } from '../Toggle'

/**
 * Settings-row toggle styled to match `SettingSelectBox` so they line up in a
 * grid. By default the label is a heading above the box (Yes/No on the left,
 * Toggle on the right). Pass `inlineLabel` for a compact single-row variant: the
 * label sits inside the box where the Yes/No readout would be.
 */
export function SettingToggleBox({
  label,
  checked,
  onChange,
  inlineLabel = false,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  inlineLabel?: boolean
}): JSX.Element {
  if (inlineLabel) {
    return (
      <div className="setting-box mt-[2px] min-h-[40px]" onClick={() => onChange(!checked)} role="button">
        <span className="value">{label}</span>
        {/* Stop click bubbling so we don't fire onChange twice when the user clicks the toggle. */}
        <div onClick={(e) => e.stopPropagation()}>
          <Toggle checked={checked} onChange={onChange} />
        </div>
      </div>
    )
  }
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
