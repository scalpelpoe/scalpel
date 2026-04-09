import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RgbaColorPicker } from 'react-colorful'
import type { FilterAction, RgbaColor } from '../../../../shared/types'
import { getColorFreqs } from './color-freq-cache'
import type { ColorEntry } from './types'

function ColorInputs({
  rgba,
  onChange,
}: {
  rgba: RgbaColor
  onChange: (c: { r: number; g: number; b: number; a: number }) => void
}): JSX.Element {
  const toHex = (c: RgbaColor): string => '#' + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, '0')).join('')

  const [hex, setHex] = useState(toHex(rgba))

  // Sync hex field when color changes externally (picker/swatch)
  const prevRgba = useRef(rgba)
  if (prevRgba.current.r !== rgba.r || prevRgba.current.g !== rgba.g || prevRgba.current.b !== rgba.b) {
    prevRgba.current = rgba
    const newHex = toHex(rgba)
    if (hex !== newHex) setHex(newHex)
  }

  const handleHex = (val: string): void => {
    setHex(val)
    const clean = val.replace(/^#/, '')
    if (clean.length === 6 && /^[0-9a-fA-F]{6}$/.test(clean)) {
      onChange({
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16),
        a: rgba.a / 255,
      })
    }
  }

  const handleChannel = (channel: 'r' | 'g' | 'b' | 'a', val: string): void => {
    const n = Math.max(0, Math.min(channel === 'a' ? 255 : 255, parseInt(val) || 0))
    if (channel === 'a') {
      onChange({ r: rgba.r, g: rgba.g, b: rgba.b, a: n / 255 })
    } else {
      onChange({ ...rgba, [channel]: n, a: rgba.a / 255 })
    }
  }

  const inputClass =
    'w-8 px-1 py-[2px] text-[10px] text-center bg-bg border border-border rounded-[3px] text-text bg-black/30'

  const labelClass = 'text-[8px] text-text-dim w-6 shrink-0'

  return (
    <div className="mt-1 w-[180px] flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className={labelClass}>Hex</span>
        <input
          type="text"
          value={hex}
          onChange={(e) => handleHex(e.target.value)}
          className={`${inputClass} flex-1`}
          spellCheck={false}
        />
      </div>
      <div className="flex items-center gap-1">
        <span className={labelClass}>RGBA</span>
        {(['r', 'g', 'b', 'a'] as const).map((ch) => (
          <input
            key={ch}
            type="number"
            min={0}
            max={255}
            value={rgba[ch]}
            onChange={(e) => handleChannel(ch, e.target.value)}
            className={`${inputClass} flex-1`}
          />
        ))}
      </div>
    </div>
  )
}

export function ColorActionEditor({
  action,
  onChange,
}: {
  action: FilterAction
  onChange: (a: FilterAction) => void
}): JSX.Element {
  const [r, g, b, a] = action.values.map(Number)
  const rgba: RgbaColor = { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: a ?? 255 }
  const [open, setOpen] = useState(false)
  const [freqs, setFreqs] = useState<ColorEntry[]>([])
  const [showInputs, setShowInputs] = useState(false)
  const swatchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      getColorFreqs().then((map) => setFreqs(map[action.type] ?? []))
    }
  }, [open, action.type])

  const handleChange = (color: { r: number; g: number; b: number; a: number }): void => {
    onChange({
      ...action,
      values: [String(color.r), String(color.g), String(color.b), String(Math.round(color.a * 255))],
    })
  }

  const applySwatch = (c: ColorEntry): void => {
    onChange({
      ...action,
      values: [String(c.r), String(c.g), String(c.b), String(c.a)],
    })
  }

  const label: Record<string, string> = {
    SetTextColor: 'Text',
    SetBorderColor: 'Border',
    SetBackgroundColor: 'Background',
  }

  // Perceived brightness accounting for alpha blending on dark bg
  const blended = {
    r: rgba.r * (rgba.a / 255),
    g: rgba.g * (rgba.a / 255),
    b: rgba.b * (rgba.a / 255),
  }
  const luminance = (blended.r * 299 + blended.g * 587 + blended.b * 114) / 1000
  const isDark = luminance < 128
  const textColor = isDark ? '#fff' : 'rgba(0,0,0,0.85)'
  const shadowColor = isDark ? 'rgba(0,0,0,0.9)' : 'rgba(255,255,255,0.35)'

  const getPopoverPos = (): { left: number; top: number } => {
    const rect = swatchRef.current?.getBoundingClientRect()
    if (!rect) return { left: 0, top: 0 }
    const centerX = rect.left + rect.width / 2
    return { left: centerX, top: rect.top - 4 }
  }

  // Top swatches -- stable list, 2 rows of 9 (fits 180px picker width)
  const SWATCHES_PER_ROW = 9
  const MAX_SWATCHES = SWATCHES_PER_ROW * 2
  const swatches = freqs.slice(0, MAX_SWATCHES)

  return (
    <div ref={swatchRef} className="flex-1">
      <div onClick={() => setOpen((o) => !o)} className="flex items-center gap-[6px] cursor-pointer rounded">
        <div
          className="w-full h-7 rounded-[3px] border border-white/[0.08] flex items-center justify-between px-[6px]"
          style={{ background: `rgba(${rgba.r},${rgba.g},${rgba.b},${rgba.a / 255})` }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-[0.5px]"
            style={{
              color: textColor,
              textShadow: `0 1px 2px ${shadowColor}`,
            }}
          >
            {label[action.type] ?? action.type}
          </span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            className="opacity-[0.85]"
            style={{ filter: `drop-shadow(0 1px 2px ${shadowColor})` }}
          >
            <title>Pick color</title>
            <path
              d="M13.3 2.7a2.4 2.4 0 0 0-3.4 0L8.5 4.1 7.1 2.7 5.7 4.1l1.4 1.4-5 5V13h2.5l5-5 1.4 1.4 1.4-1.4-1.4-1.4 1.4-1.4a2.4 2.4 0 0 0 .8-1.7c0-.7-.3-1.3-.8-1.8z"
              fill={textColor}
            />
          </svg>
        </div>
      </div>
      {open &&
        (() => {
          const pos = getPopoverPos()
          return createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
              <div
                className="fixed -translate-x-1/2 -translate-y-full z-[9999] bg-bg-card border border-border rounded-md p-2 shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
                style={{ left: pos.left, top: pos.top }}
              >
                <RgbaColorPicker color={{ r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a / 255 }} onChange={handleChange} />
                {swatches.length > 0 && (
                  <div className="mt-[6px]">
                    <div className="text-[9px] text-text-dim mb-1 uppercase tracking-[0.5px]">Most used</div>
                    <div
                      className="grid gap-[3px] w-[180px]"
                      style={{ gridTemplateColumns: `repeat(${SWATCHES_PER_ROW}, 16px)` }}
                    >
                      {swatches.map((c, i) => {
                        const isActive = c.r === rgba.r && c.g === rgba.g && c.b === rgba.b && c.a === rgba.a
                        return (
                          <div
                            key={i}
                            onClick={() => applySwatch(c)}
                            title={`${c.r} ${c.g} ${c.b}${c.a < 255 ? ' ' + c.a : ''} (${c.category})`}
                            className="w-4 h-4 rounded-sm cursor-pointer"
                            style={{
                              background: `rgba(${c.r},${c.g},${c.b},${c.a / 255})`,
                              border: isActive ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.15)',
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}
                <div
                  onClick={() => setShowInputs((v) => !v)}
                  className="mt-[6px] text-[9px] text-text-dim cursor-pointer uppercase tracking-[0.5px] flex items-center gap-1"
                >
                  <span
                    className="inline-block transition-transform duration-150"
                    style={{ transform: showInputs ? 'rotate(90deg)' : 'none' }}
                  >
                    ▸
                  </span>
                  Manual input
                </div>
                {showInputs && <ColorInputs rgba={rgba} onChange={handleChange} />}
              </div>
            </>,
            document.body,
          )
        })()}
    </div>
  )
}
