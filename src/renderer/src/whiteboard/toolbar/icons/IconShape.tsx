import type { ShapeElement } from '@shared/whiteboard-types'
import { IconBase, type BaseProps } from './IconBase'

export function IconShape({
  variant = 'rect',
  size,
}: { variant?: ShapeElement['shape'] } & BaseProps = {}): JSX.Element {
  /* Closed shapes (rect / ellipse / triangle) get a two-tone treatment:
   * full-strength `currentColor` stroke + a 25%-opacity fill in the same hue.
   * Mirrors how shapes render on the canvas itself (faint fill, bright
   * outline) so the picker icon previews the result. Open paths (line,
   * arrow) stay outline-only. */
  const filled = { fill: 'currentColor', fillOpacity: 0.25 }
  return (
    <IconBase size={size}>
      {variant === 'ellipse' && <circle cx="12" cy="12" r="8" {...filled} />}
      {variant === 'triangle' && <path d="M12 4l9 16H3z" {...filled} />}
      {variant === 'line' && <path d="M5 19L19 5" />}
      {variant === 'arrow' && (
        <>
          <path d="M5 19L19 5" />
          <path d="M13 5h6v6" />
        </>
      )}
      {variant === 'rect' && <rect x="4" y="5" width="16" height="14" rx="1.5" {...filled} />}
    </IconBase>
  )
}
