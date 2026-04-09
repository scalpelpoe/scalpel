import type { PoeItem, PriceInfo } from '../../../shared/types'
import { ArrowRight } from '@icon-park/react'
import { chaosIcon, divineIcon } from '../shared/icons'
import { iconMap, divCardArtMap, RARITY_COLORS } from '../shared/constants'
import { formatPrice } from '../shared/utils'
import dustValues from '../../../shared/data/economy/dust-values.json'
import ninjaIcon from '../assets/other/poe-ninja.png'
import dustIcon from '../assets/currency/thaumaturgic-dust.png'
import socketRed from '../assets/sockets/socket-red.png'
import socketGreen from '../assets/sockets/socket-green.png'
import socketBlue from '../assets/sockets/socket-blue.png'
import socketWhite from '../assets/sockets/socket-white.png'
import divCardsData from '../../../shared/data/economy/div-cards.json'
import baseToUniques from '../../../shared/data/items/unique-info.json'
import itemClassesData from '../../../shared/data/items/item-classes.json'
import { ItemChip } from './ItemChip'
import { IconGlow } from '../shared/IconGlow'
import mapFrameIcon from '../assets/other/map-frame.png'
const divCardInfoMap = new Map(
  (divCardsData as Array<{ name: string; reward: string; stack: number }>).map((c) => [
    c.name,
    { reward: c.reward, stack: c.stack },
  ]),
)
const _baseToUniques = baseToUniques as Record<string, string[]>
const uniqueToBase: Record<string, string> = {}
for (const [base, uniques] of Object.entries(_baseToUniques)) {
  for (const name of uniques) uniqueToBase[name] = base
}
const itemClasses = itemClassesData as Record<string, { bases: string[]; size: [number, number] }>
const classMap: Record<string, string> = {}
for (const [cls, { bases }] of Object.entries(itemClasses)) {
  for (const base of bases) classMap[base] = cls
}

function getUniqueItemClass(uniqueName: string): string {
  const base = uniqueToBase[uniqueName]
  if (!base) return ''
  return classMap[base] ?? ''
}
import socketLink from '../assets/sockets/socket-link.png'
const dustMap = dustValues as Record<string, number>
const classSizes: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(itemClasses).map(([k, v]) => [k, v.size]),
)

// Build dust-by-base map: max dust value per base type
const dustBaseMap: Record<string, number> = {}
for (const [name, val] of Object.entries(dustMap)) {
  const base = uniqueToBase[name]
  if (!base) continue
  if (!dustBaseMap[base] || val > dustBaseMap[base]) dustBaseMap[base] = val
}

// Build dimensions map from item-classes
function getDims(baseType: string, itemClass: string): { w: number; h: number } | undefined {
  const cs = classSizes[itemClass]
  if (cs) return { w: cs[0], h: cs[1] }
  // Fall back: find item class for this base type
  const cls = classMap[baseType]
  if (cls) {
    const s = classSizes[cls]
    if (s) return { w: s[0], h: s[1] }
  }
  return undefined
}

function calcDust(baseDust: number, item: PoeItem): number {
  const ilvl = Math.min(Math.max(item.itemLevel, 65), 84)
  let bonus = item.quality * 2
  bonus += item.influence.length * 50
  const multiplier = (bonus + 100) / 100
  return Math.round(baseDust * 125 * (20 - (84 - ilvl)) * multiplier)
}

function getDustInfo(item: PoeItem): { value: number; upTo?: boolean } | null {
  if (item.rarity !== 'Unique') return null
  const baseDust = dustMap[item.name] ?? dustMap[item.name.replace(/^(Foulborn|Imbued) /, '')]
  if (baseDust) return { value: calcDust(baseDust, item) }
  // Unidentified unique: show max possible dust for this base type
  if (!item.identified) {
    const maxBaseDust = dustBaseMap[item.baseType]
    if (maxBaseDust) return { value: calcDust(maxBaseDust, item), upTo: true }
  }
  return null
}

function getItemIcon(item: PoeItem): string | null {
  // Divination cards: use CDN card art
  if (item.itemClass === 'Divination Cards') {
    const art = divCardArtMap.get(item.baseType) ?? divCardArtMap.get(item.name)
    if (art) return `https://web.poecdn.com/image/divination-card/${art}.png`
  }
  // Try exact name first (unique maps, special items)
  if (iconMap[item.name]) return iconMap[item.name]
  // Strip Foulborn/Imbued prefix for unique variant lookups
  const strippedName = item.name.replace(/^(Foulborn|Imbued) /, '')
  if (strippedName !== item.name && iconMap[strippedName]) return iconMap[strippedName]
  // Map variants: blighted/zana have distinct icons keyed by prefix
  if (item.itemClass === 'Maps' && item.baseType.startsWith('Map (Tier')) {
    if (item.zanaMemory) {
      const zanaKey = `Zana ${item.baseType}`
      if (iconMap[zanaKey]) return iconMap[zanaKey]
    }
    if (item.blighted) {
      const blightKey = `Blighted ${item.baseType}`
      if (iconMap[blightKey]) return iconMap[blightKey]
    }
  }
  return iconMap[item.baseType] ?? null
}

function RewardText({ reward }: { reward: string }): JSX.Element {
  const corruptMatch = reward.match(/((?:[\w-]*Implicit),?\s*)?Corrupted/)
  // Strip comma between Implicit and Corrupted for cleaner display
  const corruptStr = corruptMatch ? corruptMatch[0].replace(',', '') : ''
  const clean = reward.replace(corruptStr, '').replace(/,\s*$/, '').replace(/^,\s*/, '').trim()
  return (
    <>
      {clean && <span style={{ color: '#f0c27f' }}>{clean}</span>}
      {corruptStr && (
        <span className="font-semibold" style={{ color: '#ef5350' }}>
          {corruptStr}
        </span>
      )}
    </>
  )
}

interface Props {
  item: PoeItem
  priceInfo?: PriceInfo
  rightSlot?: React.ReactNode
  onRecolor?: () => void
  onDustExplore?: () => void
  onDivExplore?: () => void
  hideSockets?: boolean
  /** When true, no negative margin - for use inside scroll containers */
  flush?: boolean
}

// Build map ID -> map name lookup and card -> areas lookup
const divCardDropMap = new Map(
  (divCardsData as Array<{ name: string; drop: { areas: string[] } }>).map((c) => [c.name, c.drop.areas]),
)
import mapsData from '../../../shared/data/economy/div-maps.json'
const mapNameLookup = new Map(
  (mapsData as Array<{ ids: string[]; name: string }>).flatMap((m) => m.ids.map((id) => [id, m.name])),
)

export function ItemSummary({
  item,
  priceInfo,
  rightSlot,
  onRecolor,
  onDustExplore,
  onDivExplore,
  hideSockets,
  flush,
}: Props): JSX.Element {
  const color = RARITY_COLORS[item.rarity] ?? '#c8c8c8'
  const iconUrl = getItemIcon(item)
  const isDivCard = item.itemClass === 'Divination Cards'
  const dims = getDims(item.baseType, item.itemClass)
  const iconW = isDivCard ? 56 : 40
  const iconH = isDivCard ? 40 : dims && dims.h >= 3 ? (dims.w === 1 ? 80 : 40 * (dims.h / 2)) : 40
  const glowSize = isDivCard ? 80 : iconH * 2.2

  return (
    <div
      className="bg-bg-solid border-b border-border flex gap-[10px] items-center overflow-hidden px-3 py-[10px]"
      style={{
        margin: flush ? 0 : '-12px -12px 0 -12px',
      }}
    >
      {iconUrl && (
        <IconGlow
          src={iconUrl}
          size={iconW}
          height={iconH}
          blur={14}
          opacity={0.6}
          glowWidth={glowSize}
          glowHeight={glowSize}
          alt={item.baseType}
          imgStyle={{ imageRendering: 'auto' }}
        />
      )}

      <div className="flex-1 flex flex-col gap-1 min-w-0 relative z-[1]">
        <span className="font-bold text-sm" style={{ color }}>
          {item.name}
        </span>

        {item.baseType !== item.name && <span className="text-text-dim text-xs">{item.baseType}</span>}

        {item.itemClass === 'Divination Cards' &&
          (() => {
            const info = divCardInfoMap.get(item.baseType) ?? divCardInfoMap.get(item.name)
            if (!info) return null
            const firstName = info.reward.split(',')[0].trim()
            // Parse "Nx ItemName" multiplier prefix
            const multiMatch = firstName.match(/^(\d+)x\s+(.+)$/)
            const rewardMulti = multiMatch ? parseInt(multiMatch[1]) : null
            const rewardItemName = multiMatch ? multiMatch[2] : firstName
            const rewardIsDivCard = !!divCardArtMap.get(rewardItemName)
            const hasIcon = rewardIsDivCard || !!(iconMap[info.reward] ?? iconMap[rewardItemName])
            const rewardSuffix =
              hasIcon && info.reward.length > firstName.length ? info.reward.slice(firstName.length) : ''
            return (
              <span className="text-[11px] text-text-dim flex items-center gap-1">
                <span className="text-text font-medium">{info.stack}x</span>
                <ArrowRight size={10} fill="var(--text-dim)" className="flex" />
                {rewardMulti && <span className="text-text font-medium">{rewardMulti}x</span>}
                {hasIcon ? (
                  <ItemChip
                    name={rewardItemName}
                    itemClass={rewardIsDivCard ? 'Divination Cards' : undefined}
                    onClick={() =>
                      rewardIsDivCard
                        ? window.api.lookupBaseType(rewardItemName, 'Divination Cards')
                        : window.api.lookupBaseType(
                            uniqueToBase[rewardItemName] ?? rewardItemName,
                            getUniqueItemClass(rewardItemName),
                            'Unique',
                            rewardItemName,
                          )
                    }
                  />
                ) : (
                  <RewardText reward={rewardMulti ? info.reward.replace(/^\d+x\s+/, '') : info.reward} />
                )}
                {rewardSuffix &&
                  (() => {
                    const isCorrupted = rewardSuffix.includes('Corrupted')
                    const rawCorrupted = isCorrupted
                      ? (rewardSuffix.match(/((?:[\w-]*Implicit),?\s*)?Corrupted/)?.[0] ?? 'Corrupted')
                      : ''
                    const displayCorrupted = rawCorrupted.replace(',', '')
                    const withoutCorrupted = rewardSuffix
                      .replace(rawCorrupted, '')
                      .replace(/^,\s*/, '')
                      .replace(/,\s*$/, '')
                      .trim()
                    return (
                      <>
                        {withoutCorrupted && <span className="text-text-dim text-[10px]">{withoutCorrupted}</span>}
                        {isCorrupted && (
                          <span className="text-[10px] font-semibold" style={{ color: '#ef5350' }}>
                            {displayCorrupted}
                          </span>
                        )}
                      </>
                    )
                  })()}
              </span>
            )
          })()}

        {(() => {
          const dustInfo = getDustInfo(item)
          const hasPrice = priceInfo && priceInfo.chaosValue > 0
          if (!hasPrice && !dustInfo) return null
          const chipClass =
            'inline-flex items-center gap-1 rounded-full text-[11px] leading-none bg-black/25 px-2 py-[3px]'
          return (
            <div className="flex gap-[6px] items-center">
              {hasPrice && (
                <span className={chipClass}>
                  <img src={ninjaIcon} alt="" className="w-3 h-3" />
                  {priceInfo.divineValue != null && priceInfo.divineValue >= 1 ? (
                    <>
                      <span className="text-white font-semibold">{formatPrice(priceInfo.divineValue)}</span>
                      <img src={divineIcon} alt="div" className="w-3.5 h-3.5" />
                    </>
                  ) : (
                    <>
                      <span className="text-white font-semibold">{formatPrice(priceInfo!.chaosValue)}</span>
                      <img src={chaosIcon} alt="chaos" className="w-3.5 h-3.5" />
                    </>
                  )}
                </span>
              )}
              {dustInfo != null && (
                <span className={chipClass}>
                  <img src={dustIcon} alt="" className="w-3.5 h-3.5" />
                  <span className="text-white font-semibold">
                    {dustInfo.upTo ? `Up to: ${dustInfo.value.toLocaleString()}` : dustInfo.value.toLocaleString()}
                  </span>
                  {onDustExplore && (
                    <button
                      onClick={onDustExplore}
                      className="text-[9px] font-semibold text-accent border-none rounded-full cursor-pointer ml-0.5 px-2 py-[2px] bg-white/[0.08]"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                      }}
                    >
                      Explore
                    </button>
                  )}
                </span>
              )}
            </div>
          )
        })()}

        {/* Div card drop maps */}
        {item.itemClass === 'Divination Cards' &&
          (() => {
            const areas = divCardDropMap.get(item.baseType) ?? divCardDropMap.get(item.name) ?? []
            const mapNames = areas.map((a) => mapNameLookup.get(a)).filter(Boolean) as string[]
            if (mapNames.length === 0) return null
            return (
              <div className="flex gap-[6px] flex-wrap mt-0.5 items-center">
                <span className="inline-flex items-center gap-1 flex-wrap rounded-full text-[11px] leading-none bg-black/25 px-2 py-[3px]">
                  <span className="text-text-dim text-[10px] mr-0.5">Drops in</span>
                  {mapNames.slice(0, 2).map((name) => (
                    <span key={name} className="text-white font-semibold inline-flex items-center gap-[3px]">
                      <span className="relative w-[10px] h-[10px] shrink-0">
                        <img src={mapFrameIcon} alt="" className="w-[10px] h-[10px]" />
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[rgba(180,40,40,0.8)]" />
                      </span>
                      {name.replace(' Map', '')}
                    </span>
                  ))}
                  {mapNames.length > 2 && (
                    <span className="text-text-dim text-[9px] ml-0.5">+{mapNames.length - 2} more</span>
                  )}
                  {onDivExplore && (
                    <button
                      onClick={onDivExplore}
                      className="text-[9px] font-semibold text-accent border-none rounded-full cursor-pointer ml-0.5 px-2 py-[2px] bg-white/[0.08]"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                      }}
                    >
                      Explore
                    </button>
                  )}
                </span>
              </div>
            )
          })()}

        <div className="flex gap-[6px] flex-wrap mt-0.5">
          {item.itemLevel > 0 &&
            !item.itemClass.includes('Currency') &&
            item.itemClass !== 'Map Fragments' &&
            item.itemClass !== 'Misc Map Items' &&
            item.itemClass !== 'Divination Cards' && (
              <span className="inline-flex items-center gap-1 rounded-full text-[11px] bg-black/25 px-2 py-[3px]">
                <span className="text-text-dim">iLvl</span>
                <span className="text-text font-semibold">{item.itemLevel}</span>
              </span>
            )}
          {item.quality > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full text-[11px] bg-black/25 px-2 py-[3px]">
              <span className="text-text-dim">Quality</span>
              <span className="text-text font-semibold">{item.quality}%</span>
            </span>
          )}
          {hideSockets && item.reqStr > 0 && (
            <span className="inline-flex items-center gap-[3px] rounded-full text-[11px] bg-black/25 py-[3px] pr-2 pl-1">
              <img src={socketRed} alt="" className="w-3.5 h-3.5" />
              <span className="text-text-dim">Str:</span>
              <span className="text-text font-semibold">{item.reqStr}</span>
            </span>
          )}
          {hideSockets && item.reqDex > 0 && (
            <span className="inline-flex items-center gap-[3px] rounded-full text-[11px] bg-black/25 py-[3px] pr-2 pl-1">
              <img src={socketGreen} alt="" className="w-3.5 h-3.5" />
              <span className="text-text-dim">Dex:</span>
              <span className="text-text font-semibold">{item.reqDex}</span>
            </span>
          )}
          {hideSockets && item.reqInt > 0 && (
            <span className="inline-flex items-center gap-[3px] rounded-full text-[11px] bg-black/25 py-[3px] pr-2 pl-1">
              <img src={socketBlue} alt="" className="w-3.5 h-3.5" />
              <span className="text-text-dim">Int:</span>
              <span className="text-text font-semibold">{item.reqInt}</span>
            </span>
          )}
          {item.sockets && !hideSockets && <SocketDisplay sockets={item.sockets} onRecolor={onRecolor} />}
          {item.corrupted && item.itemClass !== 'Divination Cards' && (
            <span className="inline-flex items-center rounded-full text-[11px] font-semibold bg-black/25 px-2 py-[3px] text-[#ef5350]">
              Corrupted
            </span>
          )}
          {item.mirrored && (
            <span className="inline-flex items-center rounded-full text-[11px] font-semibold bg-black/25 px-2 py-[3px] text-[#88ccff]">
              Mirrored
            </span>
          )}
          {item.fractured && (
            <span className="inline-flex items-center rounded-full text-[11px] font-semibold bg-black/25 px-2 py-[3px] text-[#a29162]">
              Fractured
            </span>
          )}
          {item.synthesised && (
            <span className="inline-flex items-center rounded-full text-[11px] font-semibold bg-black/25 px-2 py-[3px] text-[#8888ff]">
              Synthesised
            </span>
          )}
          {item.influence.map((inf) => (
            <span
              key={inf}
              className="inline-flex items-center rounded-full text-[11px] font-semibold bg-black/25 px-2 py-[3px] text-[#c8a96e]"
            >
              {inf}
            </span>
          ))}
        </div>
      </div>

      {rightSlot}
    </div>
  )
}

function _Chip({
  label,
  value,
  color,
  mono,
}: {
  label: string
  value: string
  color?: string
  mono?: boolean
}): JSX.Element {
  return (
    <span className="text-[11px]">
      {label && <span className="text-text-dim">{label}: </span>}
      <span
        style={{
          color: color ?? 'var(--text)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
        }}
      >
        {value}
      </span>
    </span>
  )
}

const SOCKET_ICONS: Record<string, string> = {
  R: socketRed,
  G: socketGreen,
  B: socketBlue,
  W: socketWhite,
  A: socketWhite,
  D: socketWhite,
}
const SOCKET_SIZE = 18
const LINK_WIDTH = 10
const LINK_OVERLAP = 1

function SocketDisplay({ sockets, onRecolor }: { sockets: string; onRecolor?: () => void }): JSX.Element {
  const groups = sockets.split(' ').filter(Boolean)

  return (
    <div className="inline-flex items-center gap-[6px] rounded-full bg-black/25 px-1.5 py-[3px]">
      {groups.map((group, gi) => {
        const colors = group.split('-')
        return (
          <div key={gi} className="flex items-center relative" style={{ height: SOCKET_SIZE }}>
            {colors.map((c, ci) => {
              const icon = SOCKET_ICONS[c] ?? socketWhite
              const isLinked = ci < colors.length - 1
              return (
                <div key={ci} className="contents">
                  <img
                    src={icon}
                    alt={c}
                    className="relative z-[2]"
                    style={{
                      width: SOCKET_SIZE,
                      height: SOCKET_SIZE,
                    }}
                  />
                  {isLinked && (
                    <img
                      src={socketLink}
                      alt="-"
                      className="relative z-[1] object-contain"
                      style={{
                        width: LINK_WIDTH,
                        height: SOCKET_SIZE,
                        marginLeft: -LINK_OVERLAP,
                        marginRight: -LINK_OVERLAP,
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      <button
        onClick={onRecolor}
        className="text-[9px] font-semibold text-accent border-none rounded-full cursor-pointer ml-0.5 px-2 py-[2px] bg-white/[0.08]"
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.15)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
        }}
      >
        Recolor
      </button>
    </div>
  )
}
