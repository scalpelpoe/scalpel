import { Text } from 'react-konva'

interface Props {
  x: number
  y: number
  text: string
  color: string
}

/** Outline that contrasts the fill so the label reads in any color: a dark fill
 *  (e.g. black) gets a white halo, a light fill a black one. Uses the same
 *  perceived-luminance weights/threshold as ColorActionEditor. Accepts #rgb,
 *  #rrggbb, or #rrggbbaa (alpha ignored); falls back to black on a bad value. */
function outlineColor(fill: string): string {
  const hex = fill.replace('#', '')
  const full = hex.length === 3 ? hex.replace(/(.)/g, '$1$1') : hex
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return '#000000'
  const luminance = (r * 299 + g * 587 + b * 114) / 1000
  return luminance < 128 ? '#ffffff' : '#000000'
}

/** Metre readout for distance annotations: bold and slightly larger, with a
 *  contrasting outline so it stays legible against any stroke color or game
 *  backdrop (the fill is the element's own color, painted over the outline). */
export function MetreLabel({ x, y, text, color }: Props): JSX.Element {
  return (
    <Text
      x={x}
      y={y}
      text={text}
      fontSize={17}
      fontStyle="bold"
      fontFamily="'Segoe UI', system-ui"
      fill={color}
      stroke={outlineColor(color)}
      strokeWidth={3}
      fillAfterStrokeEnabled
      lineJoin="round"
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}
