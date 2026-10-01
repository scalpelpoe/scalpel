import type { ModLine, ModSection, Socket, SnapshotItem } from '@scalpel/stream-contract'
import { Button } from '@renderer/components/primitives/Button'
import { type ReactNode, type Ref, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cardToItem } from './card-item'
import { themeVars } from './ViewerRoot'

const SECTION_COLOR: Record<ModSection['kind'], string> = {
  enchant: 'var(--ssv-mod-enchant)',
  rune: 'var(--ssv-mod-enchant)',
  implicit: 'var(--ssv-mod-implicit)',
  'granted-skill': 'var(--ssv-mod-enchant)',
  explicit: 'var(--ssv-mod-explicit)',
  desecrated: 'var(--ssv-mod-desecrated)',
  bonded: 'var(--ssv-mod-enchant)',
  description: 'var(--ssv-prop)',
  flavour: 'var(--ssv-unique)',
}

const FLAG_LABELS: Array<[keyof SnapshotItem['flags'], string]> = [
  ['fractured', 'Fractured'],
  ['desecrated', 'Desecrated'],
  ['sanctified', 'Sanctified'],
  ['mirrored', 'Mirrored'],
  ['unidentified', 'Unidentified'],
]

/** Header and separator art per rarity (PoB's item tooltip frames). */
type Frame = 'unique' | 'rare' | 'magic' | 'white' | 'gem'

const FRAME: Record<SnapshotItem['rarity'], Frame> = {
  unique: 'unique',
  rare: 'rare',
  magic: 'magic',
  normal: 'white',
  gem: 'gem',
  currency: 'white',
}

function lineColor(kind: ModSection['kind'], line: ModLine): string {
  if (line.fractured) return 'var(--ssv-fractured)'
  if (line.crafted) return 'var(--ssv-mod-crafted)'
  return SECTION_COLOR[kind]
}

export function tierDetail(line: ModLine): string {
  if (!line.tier) return ''
  const affix = line.tier.affix === 'prefix' ? 'Prefix' : line.tier.affix === 'suffix' ? 'Suffix' : null
  const range = line.range ? `(${line.range.min}-${line.range.max})` : null
  return [affix, `Tier ${line.tier.num}`, range].filter(Boolean).join(' · ')
}

function ModLineView({ kind, line }: { kind: ModSection['kind']; line: ModLine }): JSX.Element {
  const [showTier, setShowTier] = useState(false)
  const detail = tierDetail(line)
  return (
    <div
      className="ssv-mod"
      style={{ color: lineColor(kind, line), ...(kind === 'flavour' ? { fontStyle: 'italic' } : {}) }}
      onMouseEnter={() => detail && setShowTier(true)}
      onMouseLeave={() => setShowTier(false)}
      onClick={() => detail && setShowTier((v) => !v)}
    >
      {line.tier && (
        <span className="ssv-tier" data-affix={line.tier.affix ?? 'none'}>
          [{line.tier.label}]
        </span>
      )}
      {showTier ? <span className="ssv-mod-note">{detail}</span> : line.text}
    </div>
  )
}

const Value = ({ children }: { children: ReactNode }): JSX.Element => <span className="ssv-val">{children}</span>

/** "Requires: Level 75, 142 Int", numbers in value colour as in game. */
function Requirements({ item }: { item: SnapshotItem }): JSX.Element {
  return (
    <div className="ssv-prop ssv-reqs">
      Requires:{' '}
      {item.requirements.map((r, i) => (
        <span key={r.name}>
          {i > 0 && ', '}
          {r.name === 'Level' ? (
            <>
              Level <Value>{r.value}</Value>
            </>
          ) : (
            <>
              <Value>{r.value}</Value> {r.name}
            </>
          )}
        </span>
      ))}
    </div>
  )
}

function priceText(price: NonNullable<SnapshotItem['price']>): string {
  const unit = price.currency === 'divine' ? 'div' : price.currency === 'exalted' ? 'ex' : 'c'
  return `≈ ${price.amount} ${unit}`
}

const FLOAT_GAP = 8
/** The floating card stays this far inside the viewport. */
const EDGE = 8

/** A socketed rune; with a card, hovering shows it beside the socket. The card goes to the body so
 *  neither the item card's box nor the overlay's clipping can cut it, and is placed from the socket's
 *  rect (no zoom or transform on a positioned element). */
function SocketChip({ socket }: { socket: Socket }): JSX.Element {
  const [hover, setHover] = useState(false)
  const chip = useRef<HTMLSpanElement>(null)
  const floating = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = floating.current
    const anchor = chip.current
    if (!hover || !el || !anchor) return
    const place = (): void => {
      const a = anchor.getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      const right = a.right + FLOAT_GAP
      const left = right + w <= vw - EDGE ? right : a.left - FLOAT_GAP - w
      el.style.left = `${Math.max(EDGE, Math.min(left, vw - EDGE - w))}px`
      el.style.top = `${Math.max(EDGE, Math.min(a.top, vh - EDGE - h))}px`
      el.style.visibility = 'visible'
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [hover])
  return (
    <span
      ref={chip}
      className="ssv-socket"
      onMouseEnter={() => socket.card && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {socket.icon && <img src={socket.icon} alt="" />}
      {socket.name}
      {hover &&
        socket.card &&
        createPortal(
          <div ref={floating} className="ssv-float-card" style={themeVars}>
            <ItemTooltip item={cardToItem(socket.card)} />
          </div>,
          document.body,
        )}
    </span>
  )
}

/** One item as the game draws it: rarity header art, properties, separators, mod sections.
 *  Mod lines keep Scalpel's tier badges; hovering (or tapping) a line shows its tier and range. */
export function ItemTooltip({
  item,
  onPriceCheck,
  rootRef,
}: {
  item: SnapshotItem
  /** The card's root element, so the price checker can take the card's width. */
  rootRef?: Ref<HTMLDivElement>
  /** Set by the caller when the item is pinned; shows the Price check button when the item has a query. */
  onPriceCheck?: () => void
}): JSX.Element {
  const frame = FRAME[item.rarity]
  const title = item.name ?? item.baseType
  const showBase = (frame === 'unique' || frame === 'rare') && item.name && item.name !== item.baseType
  const flags = FLAG_LABELS.filter(([key]) => item.flags[key])
  const corrupted = item.flags.doubleCorrupted ? 'Twice Corrupted' : item.flags.corrupted ? 'Corrupted' : null

  const blocks: JSX.Element[] = []
  if (item.properties.length > 0) {
    blocks.push(
      <div key="props">
        {item.properties.map((p) => (
          <div key={p.name} className="ssv-prop">
            {p.value === null ? (
              p.name
            ) : (
              <>
                {p.name}: <Value>{p.value}</Value>
              </>
            )}
          </div>
        ))}
      </div>,
    )
  }
  if (item.requirements.length > 0 || item.ilvl) {
    blocks.push(
      <div key="reqs">
        {item.requirements.length > 0 && <Requirements item={item} />}
        {item.ilvl ? (
          <div className="ssv-prop">
            Item Level: <Value>{item.ilvl}</Value>
          </div>
        ) : null}
      </div>,
    )
  }
  for (const [i, section] of item.sections.entries()) {
    blocks.push(
      <div key={`s${i}`}>
        {section.lines.map((line, j) => (
          <ModLineView key={j} kind={section.kind} line={line} />
        ))}
      </div>,
    )
  }
  if (item.sockets.some((s) => s.name) || flags.length > 0 || corrupted) {
    blocks.push(
      <div key="meta">
        {item.sockets.some((s) => s.name) && (
          <div className="ssv-sockets">
            {item.sockets
              .filter((s) => s.name)
              .map((s, i) => (
                <SocketChip key={i} socket={s} />
              ))}
          </div>
        )}
        {(flags.length > 0 || corrupted) && (
          <div className="ssv-flags">
            {flags.map(([key, label]) => (
              <span key={key} className="ssv-flag">
                {label}
              </span>
            ))}
            {corrupted && <span className="ssv-flag-corrupted">{corrupted}</span>}
          </div>
        )}
      </div>,
    )
  }

  return (
    <div ref={rootRef} className="ssv-tooltip" role="tooltip" data-frame={frame}>
      <div className="ssv-tooltip-head" data-frame={frame}>
        <div className={`ssv-tooltip-name ssv-r-${item.rarity}`}>{title}</div>
        {showBase && <div className={`ssv-tooltip-name ssv-r-${item.rarity}`}>{item.baseType}</div>}
      </div>
      <div className="ssv-tooltip-body">
        {blocks.map((block, i) => (
          <div key={block.key ?? i}>
            {i > 0 && <div className="ssv-sep" data-frame={frame} />}
            {block}
          </div>
        ))}
        {item.price && <div className="ssv-price">{priceText(item.price)}</div>}
      </div>
      {onPriceCheck && item.priceCheck && (
        <div className="flex justify-center px-2 py-2 border-t border-border">
          <Button size="sm" onClick={onPriceCheck}>
            Price check
          </Button>
        </div>
      )}
    </div>
  )
}
