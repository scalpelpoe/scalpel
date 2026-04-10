import type { FilterBlock } from '../../../shared/types'

/** Extract PoE loot label colors and font size from a filter block's actions */
export function extractLabelStyle(block: FilterBlock): {
  textColor: string
  bgColor: string
  borderColor: string
  fontSize: number
} {
  let textColor = 'rgba(200, 200, 200, 1)'
  let bgColor = 'transparent'
  let borderColor = 'transparent'
  let fontSize = 32

  for (const action of block.actions) {
    const vals = action.values.map(Number)
    switch (action.type) {
      case 'SetTextColor':
        textColor = `rgba(${vals[0]},${vals[1]},${vals[2]},${(vals[3] ?? 255) / 255})`
        break
      case 'SetBackgroundColor':
        bgColor = `rgba(${vals[0]},${vals[1]},${vals[2]},${(vals[3] ?? 255) / 255})`
        break
      case 'SetBorderColor':
        borderColor = `rgba(${vals[0]},${vals[1]},${vals[2]},${(vals[3] ?? 255) / 255})`
        break
      case 'SetFontSize':
        fontSize = vals[0] || 32
        break
    }
  }

  return { textColor, bgColor, borderColor, fontSize }
}

/** Renders the item name styled like an in-game PoE loot label */
export function LootLabel({
  block,
  label,
  showStack,
}: {
  block: FilterBlock
  label: string
  showStack?: { min: number }
}): JSX.Element {
  const { textColor, bgColor, borderColor, fontSize } = extractLabelStyle(block)
  const scaledSize = Math.round(fontSize * 0.48)
  const text = showStack ? `${showStack.min}x ${label}` : label
  return (
    <span
      className="whitespace-nowrap overflow-hidden text-ellipsis inline-block max-w-full rounded-sm"
      style={{
        fontFamily: "'Fontin SmallCaps', serif",
        fontSize: scaledSize,
        lineHeight: 1.2,
        color: textColor,
        background: bgColor,
        border: borderColor !== 'transparent' ? `0.5px solid ${borderColor}` : 'none',
        padding: '1px 6px',
      }}
    >
      {text}
    </span>
  )
}

/** Renders a dimmed "HIDDEN" loot label */
export function HiddenLootLabel({ label }: { label: string }): JSX.Element {
  return (
    <span
      className="text-[11px] whitespace-nowrap overflow-hidden text-ellipsis inline-block max-w-full rounded-sm"
      style={{
        fontFamily: "'Fontin SmallCaps', serif",
        lineHeight: 1.2,
        color: 'rgba(200, 200, 200, 0.25)',
        background: 'rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(200, 200, 200, 0.1)',
        padding: '1px 6px',
      }}
    >
      {label}
    </span>
  )
}
