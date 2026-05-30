import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Down } from '@icon-park/react'
import { PRESET_COLORS } from './preset-colors'

/** Compact color field for the save panel: a dropdown-styled trigger showing
 *  the current swatch plus a chevron, with the swatch menu rendered through a
 *  portal so it is never clipped by the panel's overflow. */
export function PresetColorPicker({
  value,
  onChange,
}: {
  value: string | undefined
  onChange: (color: string | undefined) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Anchor the menu's right edge to the trigger's right edge (paired with a
  // -translate-x-full on the menu) so it never spills off the panel's right side.
  const menuPos = (): { left: number; top: number } => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return { left: 0, top: 0 }
    return { left: rect.right, top: rect.bottom + 4 }
  }

  const pick = (color: string | undefined): void => {
    onChange(color)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        title="Preset color"
        className="setting-box shrink-0 cursor-pointer h-[34px] box-border flex items-center gap-[6px] px-2"
        style={{ width: 56 }}
      >
        <span
          className="w-[14px] h-[14px] rounded-full border border-white/25 shrink-0"
          style={{ background: value ?? 'transparent' }}
        />
        <Down size={12} theme="outline" fill="currentColor" className="text-text-dim" />
      </button>
      {open &&
        (() => {
          const pos = menuPos()
          return createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
              <div
                className="fixed -translate-x-full z-[9999] bg-bg-card border border-border rounded-md p-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)] flex flex-col gap-1 w-max"
                style={{ left: pos.left, top: pos.top }}
              >
                <button
                  onClick={() => pick(undefined)}
                  className="flex items-center gap-2 text-[10px] text-text-dim hover:text-text cursor-pointer px-1 py-[3px] rounded hover:bg-white/5 bg-transparent border-none"
                >
                  <span className="w-[14px] h-[14px] rounded-full border border-white/30 shrink-0" />
                  None
                </button>
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => pick(c.value)}
                    className="flex items-center gap-2 text-[10px] text-text-dim hover:text-text cursor-pointer px-1 py-[3px] rounded hover:bg-white/5 bg-transparent border-none"
                  >
                    <span className="w-[14px] h-[14px] rounded-full shrink-0" style={{ background: c.value }} />
                    {c.name}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )
        })()}
    </>
  )
}
