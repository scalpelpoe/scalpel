import { Star } from '@icon-park/react'
import type { Listing } from './types'
import { ATZOATL_KEY_ROOMS } from '../../../../shared/data/trade/atzoatl'
import { ModLine } from './ModLine'
import { SOCKET_IMGS, RARITY_COLORS, MOD_COLORS, getItemSize, socketLink, socketWhite } from './constants'
import { RuneSocketOverlayPoe2 } from '../sockets/RuneSocketOverlay.poe2'
import { usePoeVersion } from '../../shared/poe-version-context'

const MOD_SEPARATOR = {
  backgroundImage: 'linear-gradient(90deg, transparent, var(--border) 20%, var(--border) 80%, transparent)',
  backgroundSize: '200px 1px',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'top center',
} as const

interface ExpandedListingProps {
  listing: Listing
  itemClass: string
  itemName: string
  itemRarity: string
}

function copyItemToClipboard(d: Listing['itemData'] & {}, rarity: string, btn: HTMLElement): void {
  const lines: string[] = []
  lines.push(`Rarity: ${rarity}`)
  if (d.name && d.name !== d.baseType) lines.push(d.name)
  if (d.baseType) lines.push(d.baseType)
  lines.push('--------')
  if (d.ilvl) lines.push(`Item Level: ${d.ilvl}`)
  if (d.implicitMods?.length) {
    lines.push('--------')
    for (const mod of d.implicitMods) lines.push(`${mod} (implicit)`)
  }
  if (d.explicitMods?.length) {
    lines.push('--------')
    for (const mod of d.explicitMods) lines.push(mod)
  }
  navigator.clipboard.writeText(lines.join('\n'))
  btn.textContent = 'Copied!'
  setTimeout(() => {
    btn.textContent = 'Copy to Clipboard'
  }, 1500)
}

export function ExpandedListing({ listing: l, itemClass, itemName, itemRarity }: ExpandedListingProps): JSX.Element {
  const d = l.itemData!
  const [slotW, slotH] = getItemSize(itemClass, d.name || itemName)
  const artW = slotW * 50
  const artH = slotH * 40

  return (
    <div
      className="px-4 py-3 bg-black/25 flex items-center gap-[14px] relative overflow-hidden border-l-[3px] border-l-[rgba(200,169,110,0.7)]"
      style={{ minHeight: artH + 24 }}
    >
      {/* Background blur */}
      {l.icon && (
        <img
          src={l.icon}
          alt=""
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none"
          style={{ width: '120%', height: '120%', filter: 'blur(40px) saturate(2)', opacity: 0.15 }}
        />
      )}

      {/* Item art + sockets */}
      {l.icon && (
        <div className="absolute left-4 top-0 bottom-0 flex items-center z-[1]">
          <div className="relative" style={{ width: artW, height: artH }}>
            <img
              src={l.icon}
              alt=""
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none"
              style={{ width: artW * 1.8, height: artH * 1.5, filter: 'blur(14px) saturate(2)', opacity: 0.35 }}
            />
            <img src={l.icon} alt="" className="relative object-contain" style={{ width: artW, height: artH }} />
            {d.sockets && d.sockets.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <SocketOverlay sockets={d.sockets} itemClass={itemClass} itemName={d.name || itemName} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Copy to clipboard */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          copyItemToClipboard(d, itemRarity, e.currentTarget)
        }}
        className="absolute top-3 right-4 px-2 py-[3px] text-[9px] leading-none font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-text-dim hover:text-text border-none rounded-[3px] cursor-pointer z-[2] transition-colors"
      >
        Copy to Clipboard
      </button>

      {/* Item info + mods */}
      <div className="flex-1 flex flex-col gap-[2px] text-center items-center z-[1] relative max-w-[280px] mx-auto">
        {d.name && (
          <div className="text-xs font-semibold" style={{ color: RARITY_COLORS[d.rarity ?? itemRarity] ?? '#c8c8c8' }}>
            {d.name}
          </div>
        )}
        {d.baseType && (
          <div className="text-[10px] text-text-dim">
            {d.name !== d.baseType ? d.baseType : ''}
            {d.ilvl ? `${d.name !== d.baseType ? ' ' : ''}(iLvl ${d.ilvl})` : ''}
          </div>
        )}
        {/* Map properties (tier, IIQ, pack size, etc.) */}
        {d.mapProperties && d.mapProperties.length > 0 && (
          <div className="mt-1 pt-1 w-full flex flex-col gap-[1px]" style={MOD_SEPARATOR}>
            {d.mapProperties.map((p, i) => (
              <div key={i} className="text-[10px] text-text-dim">
                {p.name}: <span className="text-[#88ccff] font-semibold">{p.value}</span>
              </div>
            ))}
          </div>
        )}

        {d.storedExperience != null && (
          <div className="text-[10px] text-text-dim">
            Stored Experience: <span className="text-text font-semibold">{d.storedExperience.toLocaleString()}</span>
          </div>
        )}

        {/* Temple rooms */}
        {d.templeOpenRooms && d.templeOpenRooms.length > 0 && (
          <div className="mt-1 pt-1 w-full" style={MOD_SEPARATOR}>
            <div className="text-[9px] text-text-dim uppercase tracking-wider mb-[2px]">Open Rooms</div>
            {d.templeOpenRooms.map((room, ri) => {
              const isKey = ATZOATL_KEY_ROOMS.has(room)
              return (
                <div
                  key={ri}
                  className="text-[10px] flex items-center justify-center gap-1"
                  style={{ color: isKey ? '#ffd700' : '#c4a35a', fontWeight: isKey ? 600 : 400 }}
                >
                  {isKey && <Star size={10} theme="filled" fill="#ffd700" />}
                  {room}
                </div>
              )
            })}
            {d.templeObstructedRooms && d.templeObstructedRooms.length > 0 && (
              <>
                <div className="text-[9px] text-text-dim uppercase tracking-wider mt-1 mb-[2px]">Obstructed</div>
                {d.templeObstructedRooms.map((room, ri) => (
                  <div key={ri} className="text-[10px] text-text-dim text-center">
                    {room}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Heist contract info */}
        {(d.areaLevel || d.heistJob) && (
          <div className="text-[10px] text-text-dim flex gap-2">
            {d.areaLevel && (
              <span>
                Area Level: <span className="text-text font-semibold">{d.areaLevel}</span>
              </span>
            )}
            {d.heistJob && (
              <span>
                {d.heistJob.skill}: <span className="text-text font-semibold">Lv{d.heistJob.level}</span>
              </span>
            )}
          </div>
        )}

        {/* Gem / quality */}
        {(d.gemLevel || d.quality) && (
          <div className="text-[10px] text-text-dim flex gap-2">
            {d.gemLevel && (
              <span>
                Level: <span className="text-text font-semibold">{d.gemLevel}</span>
              </span>
            )}
            {d.quality && (
              <span>
                Quality: <span className="text-text font-semibold">+{d.quality}%</span>
              </span>
            )}
          </div>
        )}

        {/* Defences */}
        {(d.armour || d.evasion || d.energyShield) && (
          <div className="text-[10px] text-text-dim flex gap-2">
            {d.armour ? (
              <span>
                AR: <span className="text-[#88ccff] font-semibold">{d.armour}</span>
              </span>
            ) : null}
            {d.evasion ? (
              <span>
                EV: <span className="text-[#88ccff] font-semibold">{d.evasion}</span>
              </span>
            ) : null}
            {d.energyShield ? (
              <span>
                ES: <span className="text-[#88ccff] font-semibold">{d.energyShield}</span>
              </span>
            ) : null}
          </div>
        )}

        {/* DPS */}
        {(d.pdps || d.edps) && (
          <div className="text-[10px] text-text-dim flex gap-2">
            {d.pdps ? (
              <span>
                pDPS: <span className="text-[#88ccff] font-semibold">{Math.round(d.pdps)}</span>
              </span>
            ) : null}
            {d.edps ? (
              <span>
                eDPS: <span className="text-[#88ccff] font-semibold">{Math.round(d.edps)}</span>
              </span>
            ) : null}
            {d.dps ? (
              <span>
                DPS: <span className="text-[#88ccff] font-semibold">{Math.round(d.dps)}</span>
              </span>
            ) : null}
          </div>
        )}

        {/* Enchant mods */}
        {d.enchantMods && d.enchantMods.length > 0 && (
          <div className="mt-1 pt-1 w-full" style={MOD_SEPARATOR}>
            {d.enchantMods.map((mod, mi) => (
              <ModLine key={mi} text={mod} color={MOD_COLORS.enchant} />
            ))}
          </div>
        )}

        {/* Implicit mods */}
        {d.implicitMods && d.implicitMods.length > 0 && (
          <div className="mt-1 pt-1 w-full" style={MOD_SEPARATOR}>
            {d.implicitMods.map((mod, mi) => (
              <ModLine key={mi} text={mod} color={MOD_COLORS.implicit} tierInfo={d.modTiers?.[mod]} />
            ))}
          </div>
        )}

        {/* Explicit mods */}
        {d.explicitMods && d.explicitMods.length > 0 && (
          <div className="mt-[2px] pt-1 w-full" style={MOD_SEPARATOR}>
            {(() => {
              const fracturedSet = new Set(d.fracturedMods ?? [])
              const foulbornSet = new Set(d.foulbornMods ?? [])
              const craftedSet = new Set(d.craftedMods ?? [])
              const tiers = d.modTiers
              const mods = d.explicitMods!
              const fractured = mods.filter((m) => fracturedSet.has(m))
              const prefixes = mods.filter((m) => !fracturedSet.has(m) && tiers?.[m]?.tier.startsWith('P'))
              const suffixes = mods.filter((m) => !fracturedSet.has(m) && tiers?.[m]?.tier.startsWith('S'))
              const other = mods.filter(
                (m) => !fracturedSet.has(m) && !tiers?.[m]?.tier.startsWith('P') && !tiers?.[m]?.tier.startsWith('S'),
              )
              const sorted = [...fractured, ...prefixes, ...suffixes, ...other]
              return sorted.map((mod, mi) => (
                <ModLine
                  key={mi}
                  text={mod}
                  color={
                    foulbornSet.has(mod)
                      ? MOD_COLORS.foulborn
                      : fracturedSet.has(mod)
                        ? MOD_COLORS.fractured
                        : craftedSet.has(mod)
                          ? MOD_COLORS.crafted
                          : MOD_COLORS.explicit
                  }
                  tierInfo={tiers?.[mod]}
                />
              ))
            })()}
          </div>
        )}

        {/* Status flags */}
        {(d.identified === false || d.corrupted || d.mirrored) && (
          <div className="mt-1 pt-1 w-full flex flex-col gap-[2px]" style={MOD_SEPARATOR}>
            {d.identified === false && <div className="text-[10px] text-[#ef5350] font-semibold">Unidentified</div>}
            {d.mirrored && <div className="text-[10px] text-[#8787FE] font-semibold">Mirrored</div>}
            {d.corrupted && <div className="text-[10px] text-[#ef5350] font-semibold">Corrupted</div>}
          </div>
        )}
      </div>
    </div>
  )
}

/** Socket overlay for item art */
function SocketOverlay({
  sockets,
  itemClass,
  itemName,
}: {
  sockets: Array<{ group: number; sColour: string }>
  itemClass: string
  itemName: string
}): JSX.Element {
  const poeVersion = usePoeVersion()
  const n = sockets.length
  const sz = 20,
    gap = 5

  if (poeVersion === 2) {
    return <RuneSocketOverlayPoe2 count={n} itemClass={itemClass} itemName={itemName} sz={sz} gap={gap} />
  }

  const is1Wide = n <= 3 && !['Helmets', 'Body Armours', 'Gloves', 'Boots', 'Shields'].includes(itemClass)

  if (is1Wide || n <= 1) {
    return (
      <>
        {sockets.map((s, si) => {
          const linked = si > 0 && sockets[si - 1].group === s.group
          return (
            <div key={si} className="flex flex-col items-center">
              {linked && (
                <img
                  src={socketLink}
                  alt=""
                  style={{
                    width: 5,
                    height: gap,
                    objectFit: 'fill',
                    transform: 'rotate(90deg)',
                    filter: 'brightness(2)',
                  }}
                />
              )}
              {!linked && si > 0 && <div style={{ height: gap }} />}
              <img src={SOCKET_IMGS[s.sColour] ?? socketWhite} alt="" style={{ width: sz, height: sz }} />
            </div>
          )
        })}
      </>
    )
  }

  const positions: Array<[number, number]> = []
  for (let row = 0; row < Math.ceil(n / 2); row++) {
    if (row % 2 === 0) {
      positions.push([0, row])
      if (positions.length < n) positions.push([1, row])
    } else {
      positions.push([1, row])
      if (positions.length < n) positions.push([0, row])
    }
  }
  const cellW = sz + gap * 2,
    cellH = sz + gap * 2
  const totalW = cellW * 2,
    totalH = cellH * Math.ceil(n / 2)

  return (
    <div className="relative overflow-visible" style={{ width: totalW, height: totalH }}>
      {sockets.map((s, si) => {
        const [col, row] = positions[si]
        const x = col * cellW + gap,
          y = row * cellH + gap
        let linkEl = null
        if (si > 0 && sockets[si - 1].group === s.group) {
          const [pc, pr] = positions[si - 1]
          if (pr === row) {
            linkEl = (
              <img
                key={`l${si}`}
                src={socketLink}
                alt=""
                style={{
                  position: 'absolute',
                  left: Math.min(col, pc) * cellW + gap + sz,
                  top: y + (sz - 5) / 2,
                  width: gap * 2,
                  height: 5,
                  objectFit: 'fill',
                  filter: 'brightness(2)',
                }}
              />
            )
          } else {
            linkEl = (
              <img
                key={`l${si}`}
                src={socketLink}
                alt=""
                style={{
                  position: 'absolute',
                  left: col * cellW + gap + (sz - gap * 2) / 2,
                  top: Math.min(row, pr) * cellH + gap + sz + (gap * 2 - 5) / 2,
                  width: gap * 2,
                  height: 5,
                  objectFit: 'fill',
                  transform: 'rotate(90deg)',
                  filter: 'brightness(2)',
                }}
              />
            )
          }
        }
        return [
          linkEl,
          <img
            key={si}
            src={SOCKET_IMGS[s.sColour] ?? socketWhite}
            alt=""
            style={{ position: 'absolute', left: x, top: y, width: sz, height: sz }}
          />,
        ]
      })}
    </div>
  )
}
