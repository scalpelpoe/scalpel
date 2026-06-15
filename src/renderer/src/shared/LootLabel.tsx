import type { FilterBlock } from '@shared/types'

/** PoE's in-game loot-label background when no block in the match chain sets
 *  SetBackgroundColor. The game paints an ~60%-opaque black plate behind the
 *  label text; rendering transparent instead (our old default) made unstyled
 *  blocks look invisible against dark overlays. */
export const DEFAULT_BG = 'rgba(0, 0, 0, 0.6)'

export interface LabelStyle {
  textColor: string
  bgColor: string
  borderColor: string
  fontSize: number
}

type StyledBlock = Pick<FilterBlock, 'actions'> & { continue?: boolean }

/** Compose an effective label style from a chain of blocks that all matched
 *  the same item. Blocks should be in filter order (earliest first) so the
 *  game's "later writer wins" semantics for Continue overlays are preserved.
 *  Each action type is tracked independently: a Continue block early in the
 *  chain contributes any types the final block doesn't set, and the final
 *  block overrides any types it does set. */
export function composeLabelStyle(blocks: StyledBlock[]): LabelStyle {
  let textColor = 'rgba(200, 200, 200, 1)'
  let bgColor: string | null = null
  let borderColor = 'transparent'
  let fontSize = 32

  for (const block of blocks) {
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
  }

  // If the whole chain is a single Continue block with no SetBackgroundColor,
  // the caller is previewing a decorator in isolation -- don't paint the game's
  // default plate behind it, since the real render would overlay onto an
  // earlier block's plate instead.
  const isLoneContinue = blocks.length === 1 && blocks[0].continue === true

  return {
    textColor,
    bgColor: bgColor ?? (isLoneContinue ? 'transparent' : DEFAULT_BG),
    borderColor,
    fontSize,
  }
}

/** Legacy single-block wrapper. Prefer composeLabelStyle for any caller that
 *  has the full Continue chain available. */
export function extractLabelStyle(block: StyledBlock): LabelStyle {
  return composeLabelStyle([block])
}

/** Renders the item name styled like an in-game PoE loot label. Pass `blocks`
 *  (a full Continue chain ending in the first non-Continue match) when available
 *  so overlays applied by Continue decorators are reflected. The `block` prop
 *  remains for callers that only have a single block on hand; it renders as
 *  a one-element chain. */
export function LootLabel({
  block,
  blocks,
  label,
  showStack,
}: {
  block?: StyledBlock
  blocks?: StyledBlock[]
  label: string
  showStack?: { min: number }
}): JSX.Element {
  const chain: StyledBlock[] = blocks ?? (block ? [block] : [])
  const { textColor, bgColor, borderColor, fontSize } = composeLabelStyle(chain)
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
