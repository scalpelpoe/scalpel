import { useLayoutEffect, useRef, useState } from 'react'
import { CurrencyIcon } from '../../shared/CurrencyIcon'

interface Props {
  currencies: string[]
  active: number
  onChange: (index: number) => void
}

/** Segmented currency switch shared by the Exchange and Price Tracker panels:
 *  one recessed track with a single thumb that slides between positions, so the
 *  options read as one control rather than separate buttons. */
export function PairSwitch({ currencies, active, onChange }: Props): JSX.Element {
  // The thumb is positioned from the active segment's measured box rather than
  // from an equal-width assumption: with the "show currency names" setting on,
  // CurrencyIcon renders text labels, so "chaos" and "divine" produce segments
  // of different widths.
  const segRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const seg = segRefs.current[active]
    if (seg) setThumb({ left: seg.offsetLeft, width: seg.offsetWidth })
  }, [active, currencies.length])

  return (
    <div className="relative flex items-center shrink-0 rounded-full bg-black/40 p-[2px]">
      <div
        data-testid="exchange-pair-thumb"
        style={{
          position: 'absolute',
          top: 2,
          bottom: 2,
          left: thumb?.left ?? 0,
          width: thumb?.width ?? 0,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.16)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.45)',
          transition: 'left 180ms cubic-bezier(0.4, 0, 0.2, 1), width 180ms cubic-bezier(0.4, 0, 0.2, 1)',
          // Hidden until measured so it can't flash at the origin.
          opacity: thumb ? 1 : 0,
          pointerEvents: 'none',
        }}
      />
      {currencies.map((currency, i) => (
        <button
          key={currency}
          ref={(el) => {
            segRefs.current[i] = el
          }}
          type="button"
          data-testid="exchange-pair-pill"
          aria-label={`Show rate in ${currency}`}
          aria-pressed={i === active}
          onClick={() => onChange(i)}
          className="relative z-[1] flex items-center justify-center px-[7px] py-[2px] rounded-full border-none cursor-pointer"
          style={{
            background: 'transparent',
            opacity: i === active ? 1 : 0.45,
            transition: 'opacity 180ms ease',
          }}
        >
          <CurrencyIcon name={currency} className="w-3 h-3" />
        </button>
      ))}
    </div>
  )
}
