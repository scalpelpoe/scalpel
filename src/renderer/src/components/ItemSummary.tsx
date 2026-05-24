import type { PoeItem, PriceInfo } from '../../../shared/types'
import { ArrowRight } from '@icon-park/react'
import { PriceChip } from '../shared/PriceChip'
import { InfoChip } from '../shared/InfoChip'
import { ExternalLinkButton } from '../shared/ExternalLinkButton'
import { INFLUENCE_ICONS_BY_NAME } from './price-check/constants'
import { iconMap, divCardArtMap, RARITY_COLORS, baseToClass, classSizes } from '../shared/constants'
import { getItemIcon } from '../shared/utils'
import { getDustInfo } from '../shared/dust'
import dustIcon from '../assets/currency/thaumaturgic-dust.png'
import socketRed from '../assets/sockets/socket-red.png'
import socketGreen from '../assets/sockets/socket-green.png'
import socketBlue from '../assets/sockets/socket-blue.png'
import socketWhite from '../assets/sockets/socket-white.png'
import { RuneSocketChipPoe2 } from './sockets/RuneSocketChip.poe2'
import { usePoeVersion } from '../shared/poe-version-context'
import { getGameFeatures } from '../../../shared/game-features'
import divCardsData from '../../../shared/data/economy/div-cards.json'
import baseToUniques from '../../../shared/data/items/unique-info.json'
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

function getUniqueItemClass(uniqueName: string): string {
  const base = uniqueToBase[uniqueName]
  if (!base) return ''
  return baseToClass[base] ?? ''
}
import socketLink from '../assets/sockets/socket-link.png'

function getDims(baseType: string, itemClass: string): { w: number; h: number } | undefined {
  const cs = classSizes[itemClass]
  if (cs) return { w: cs[0], h: cs[1] }
  const cls = baseToClass[baseType]
  if (cls) {
    const s = classSizes[cls]
    if (s) return { w: s[0], h: s[1] }
  }
  return undefined
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
  /** Optional content rendered as its own row at the bottom of the hero's
   *  left column, after the iLvl/Quality/socket chip row. Used by the
   *  FilterPanel to mount the Use-Current-Zone toggle inside the hero. */
  extraRow?: React.ReactNode
  onRecolor?: () => void
  onDustExplore?: () => void
  onDivExplore?: () => void
  onOpenWiki?: () => void
  onOpenPoeDb?: () => void
  onOpenNinja?: () => void
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
  extraRow,
  onRecolor,
  onDustExplore,
  onDivExplore,
  onOpenWiki,
  onOpenPoeDb,
  onOpenNinja,
  hideSockets,
  flush,
}: Props): JSX.Element {
  const features = getGameFeatures(usePoeVersion())
  const color = RARITY_COLORS[item.rarity] ?? '#c8c8c8'
  const iconUrl = getItemIcon(item)
  const isDivCard = item.itemClass === 'Divination Cards'
  const dims = getDims(item.baseType, item.itemClass)
  const iconW = isDivCard ? 56 : 40
  const iconH = isDivCard ? 40 : dims && dims.h >= 3 ? (dims.w === 1 ? 80 : 40 * (dims.h / 2)) : 40
  const glowSize = isDivCard ? 80 : iconH * 2.2

  return (
    <div
      className="bg-bg-card border-b border-border flex gap-[10px] items-center overflow-hidden px-3 py-[10px]"
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

      <div className="flex-1 flex flex-col gap-0.5 min-w-0 relative z-[1]">
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
            const rewardMulti = multiMatch ? parseInt(multiMatch[1], 10) : null
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
          const dustInfo = features.dustExplorer ? getDustInfo(item) : null
          const hasPrice = priceInfo && priceInfo.chaosValue > 0
          if (!hasPrice && !dustInfo && !onOpenWiki && !onOpenPoeDb && !onOpenNinja) return null
          return (
            <div className="flex gap-[6px] items-center">
              {hasPrice && (
                <PriceChip
                  chaosValue={priceInfo.chaosValue}
                  divineValue={priceInfo.divineValue}
                  graph={priceInfo.graph}
                  showNinja
                />
              )}
              {dustInfo != null && (
                <InfoChip icon={dustIcon} className={onDustExplore ? '!pr-[3px]' : undefined}>
                  <span className="text-white font-semibold">
                    {dustInfo.upTo ? `Up to: ${dustInfo.value.toLocaleString()}` : dustInfo.value.toLocaleString()}
                  </span>
                  {onDustExplore && (
                    <button
                      onClick={onDustExplore}
                      className="text-[9px] font-semibold text-accent border-none rounded-full cursor-pointer px-2 py-[2px] bg-white/[0.08]"
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
                </InfoChip>
              )}
              {(onOpenWiki || onOpenPoeDb || onOpenNinja) && (
                <InfoChip className="!px-[3px]">
                  {onOpenWiki && (
                    <ExternalLinkButton label="Wiki" title="Open the wiki page in your browser" onClick={onOpenWiki} />
                  )}
                  {onOpenPoeDb && (
                    <ExternalLinkButton
                      label="PoEDB"
                      title="Open the PoEDB page in your browser"
                      onClick={onOpenPoeDb}
                    />
                  )}
                  {onOpenNinja && (
                    <ExternalLinkButton
                      label="Ninja"
                      title="Open the poe.ninja page for this item in your browser"
                      onClick={onOpenNinja}
                    />
                  )}
                </InfoChip>
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
                <InfoChip label="Drops in" className={onDivExplore ? '!pr-[3px]' : undefined}>
                  {mapNames.slice(0, 2).map((name) => (
                    <span key={name} className="text-white font-semibold inline-flex items-center gap-[3px]">
                      <span className="relative inline-block w-[10px] h-[10px] shrink-0">
                        <img src={mapFrameIcon} alt="" className="block w-[10px] h-[10px]" />
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
                      className="text-[9px] font-semibold text-accent border-none rounded-full cursor-pointer px-2 py-[2px] bg-white/[0.08]"
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
                </InfoChip>
              </div>
            )
          })()}

        <div className="flex gap-[6px] flex-wrap mt-0.5">
          {item.itemLevel > 0 &&
            !item.isSynthetic &&
            !item.itemClass.includes('Currency') &&
            item.itemClass !== 'Map Fragments' &&
            item.itemClass !== 'Misc Map Items' &&
            item.itemClass !== 'Divination Cards' && (
              <InfoChip label="iLvl">
                <span className="text-text font-semibold">{item.itemLevel}</span>
              </InfoChip>
            )}
          {item.quality > 0 && (
            <InfoChip label="Quality">
              <span className="text-text font-semibold">{item.quality}%</span>
            </InfoChip>
          )}
          {hideSockets && item.reqStr > 0 && (
            <InfoChip icon={socketRed} label="Str:">
              <span className="text-text font-semibold">{item.reqStr}</span>
            </InfoChip>
          )}
          {hideSockets && item.reqDex > 0 && (
            <InfoChip icon={socketGreen} label="Dex:">
              <span className="text-text font-semibold">{item.reqDex}</span>
            </InfoChip>
          )}
          {hideSockets && item.reqInt > 0 && (
            <InfoChip icon={socketBlue} label="Int:">
              <span className="text-text font-semibold">{item.reqInt}</span>
            </InfoChip>
          )}
          {item.sockets && !hideSockets && <SocketDisplay sockets={item.sockets} onRecolor={onRecolor} />}
          {item.corrupted && item.itemClass !== 'Divination Cards' && (
            <InfoChip color="#ef5350">
              <span className="font-semibold">Corrupted</span>
            </InfoChip>
          )}
          {item.mirrored && (
            <InfoChip color="#88ccff">
              <span className="font-semibold">Mirrored</span>
            </InfoChip>
          )}
          {item.fractured && (
            <InfoChip color="#a29162">
              <span className="font-semibold">Fractured</span>
            </InfoChip>
          )}
          {item.synthesised && (
            <InfoChip color="#8888ff">
              <span className="font-semibold">Synthesised</span>
            </InfoChip>
          )}
          {item.influence.map((inf) => (
            <InfoChip key={inf} icon={INFLUENCE_ICONS_BY_NAME[inf]} color="#c8a96e">
              <span className="font-semibold">{inf}</span>
            </InfoChip>
          ))}
        </div>
        {extraRow}
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
  const poeVersion = usePoeVersion()
  if (poeVersion === 2) {
    // PoE2 items use rune sockets only: no colors, no links. The clipboard parser
    // emits each rune socket as "S" (e.g. "S S" for two).
    const runeCount = (sockets.match(/S/g) ?? []).length
    return <>{<RuneSocketChipPoe2 count={runeCount} size={SOCKET_SIZE} />}</>
  }
  const groups = sockets.split(' ').filter(Boolean)

  return (
    <div
      className={`inline-flex items-center gap-[6px] rounded-full bg-black/25 py-[3px] ${onRecolor ? 'pl-1.5 pr-[3px]' : 'px-1.5'}`}
    >
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
        className="text-[9px] font-semibold text-accent border-none rounded-full cursor-pointer px-2 py-[2px] bg-white/[0.08]"
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
