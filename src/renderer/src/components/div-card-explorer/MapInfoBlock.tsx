import mapFrame from '../../assets/other/map-frame.png'
import { chaosIcon } from '../../shared/icons'
import { MapData } from './types'
import { formatEv } from './utils'

interface MapInfoBlockProps {
  map: MapData
  totalEv: number
  evRatio: number
  r: number
  g: number
}

export function MapInfoBlock({ map, totalEv, evRatio, r, g }: MapInfoBlockProps): JSX.Element {
  return (
    <div
      className="flex flex-col items-center w-16 shrink-0 z-[1] gap-[2px] py-[6px] px-1 border-b border-b-[rgba(30,40,80,0.3)] -ml-3 -my-2"
      style={{
        background: `linear-gradient(rgba(${r},${g},40,0.25), rgba(${r},${g},40,0.25)), var(--bg-solid)`,
      }}
    >
      <div className="relative w-9 h-9">
        <img src={mapFrame} alt="" className="w-9 h-9 absolute top-0 left-0" style={{ imageRendering: 'auto' }} />
        {map.icon && (
          <img
            src={`https://web.poecdn.com/image/${map.icon}.png`}
            alt=""
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30px] h-[30px] object-contain rounded-full"
            style={{
              filter: 'brightness(0.25) sepia(1) hue-rotate(-30deg) saturate(8)',
              clipPath: 'circle(46%)',
            }}
          />
        )}
      </div>
      <span className="text-[10px] font-semibold text-text text-center leading-tight">
        {map.name.replace(' Map', '')}
      </span>
      <span
        className={`text-xs font-bold font-mono inline-flex items-center justify-end gap-[3px] bg-[rgba(0,0,0,0.3)] rounded-r-full py-[3px] pr-2 pl-[6px] -ml-1 w-14 ${evRatio > 0.75 ? 'text-accent' : 'text-text'}`}
      >
        {formatEv(totalEv)}
        <img src={chaosIcon} alt="" className="w-3 h-3" />
      </span>
    </div>
  )
}
