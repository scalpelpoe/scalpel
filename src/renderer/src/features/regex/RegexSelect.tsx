import { Down } from '@icon-park/react'

interface RegexSelectProps {
  value: number
  options: number[]
  onChange: (v: number) => void
  disabled?: boolean
  /** Decorative suffix shown after the value and each option (e.g. "%"). */
  suffix?: string
  /** Box width in px. Defaults to 70, ScrubInput's common-case width. */
  width?: number
}

/** A native `<select>` skinned to match `ScrubInput`'s box (same height, bg,
 *  radius, font, right-aligned chevron at 0.35 opacity).
 *
 *  Chromium renders the text of an `appearance:none` `<select>` with broken
 *  vertical centering, so we don't let the select paint anything: the visible
 *  value is a normal flex-centered `<span>`, and a fully transparent select
 *  is layered on top to capture clicks and drive the native option popup. */
export function RegexSelect({
  value,
  options,
  onChange,
  disabled = false,
  suffix = '',
  width = 70,
}: RegexSelectProps): JSX.Element {
  const textColor = disabled ? 'var(--text-dim)' : 'var(--text)'
  return (
    <div
      className="relative h-7 rounded-[3px] text-[13px] select-none flex items-center"
      style={{
        width,
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid transparent',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <span
        className="flex-1 overflow-hidden whitespace-nowrap"
        style={{ paddingLeft: 8, paddingRight: 18, color: textColor, pointerEvents: 'none' }}
      >
        {value}
        {suffix}
      </span>
      <Down
        size={11}
        theme="outline"
        fill="currentColor"
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: 0.35,
          color: textColor,
          pointerEvents: 'none',
        }}
      />
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="absolute inset-0 w-full h-full border-none outline-none"
        style={{
          opacity: 0,
          appearance: 'none',
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
            {suffix}
          </option>
        ))}
      </select>
    </div>
  )
}
