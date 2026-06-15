import { useWhiteboardStore } from '../state/store'
import { IconShape } from './icons'
import type { ShapeElement } from '@shared/whiteboard-types'

const VARIANTS: Array<{ value: ShapeElement['shape']; label: string }> = [
  { value: 'rect', label: 'Rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'line', label: 'Line' },
  { value: 'arrow', label: 'Arrow' },
]

export function ShapeVariantPicker(): JSX.Element {
  const variant = useWhiteboardStore((s) => s.shapeVariant)
  const setVariant = useWhiteboardStore((s) => s.setShapeVariant)
  return (
    <div className="flex gap-1 items-center px-1">
      {VARIANTS.map((v) => {
        const active = v.value === variant
        return (
          <button
            key={v.value}
            type="button"
            className={[
              'btn-ghost btn-bounce w-9 h-9 flex items-center justify-center',
              active ? 'text-text' : 'text-text-dim',
            ].join(' ')}
            onClick={() => setVariant(v.value)}
            title={v.label}
            aria-pressed={active}
          >
            <IconShape variant={v.value} />
          </button>
        )
      })}
    </div>
  )
}
