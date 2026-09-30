import type { StreamSnapshot } from '@scalpel/stream-contract'
import { IconGlow } from '@renderer/shared/IconGlow'
import { useEffect, useState } from 'react'
import { STALE_AFTER_MS } from '../config'
import { ageMs, ageShort, ageText } from '../data/time'

/** poe.ninja data this much older than the publish time is worth calling out separately. */
const SOURCE_LAG_NOTE_MS = 30 * 60 * 1000

/** poe.ninja's ascendancy and base-class portraits, keyed by the lower-case, hyphenated name. */
const PORTRAIT_BASE = 'https://assets.poe.ninja/poe2/classes/'

export function portraitUrl(className: string): string {
  const slug = className
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${PORTRAIT_BASE}${slug}.webp`
}

/** Nav timing: when Scalpel published, plus when poe.ninja last synced the gear if that lags behind. */
export function UpdatedAge({ snapshot, now }: { snapshot: StreamSnapshot; now: number }): JSX.Element {
  const stale = ageMs(snapshot.publishedUtc, now) > STALE_AFTER_MS
  const lagging = Date.parse(snapshot.publishedUtc) - Date.parse(snapshot.source.updatedUtc) > SOURCE_LAG_NOTE_MS
  const title = [
    `Published ${ageText(snapshot.publishedUtc, now)}.`,
    lagging ? `poe.ninja last synced this gear ${ageText(snapshot.source.updatedUtc, now)}.` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span className="shrink-0 whitespace-nowrap text-[10px] text-text-dim" title={title}>
      <span className={stale ? 'ssv-stale' : undefined}>Updated {ageShort(snapshot.publishedUtc, now)}</span>
      {lagging && <span> · synced {ageShort(snapshot.source.updatedUtc, now)}</span>}
    </span>
  )
}

/** False once the image fails to load, so a class poe.ninja has no art for yet falls back. */
function useImageLoads(src: string): boolean {
  const [ok, setOk] = useState(true)
  useEffect(() => {
    setOk(true)
    const probe = new Image()
    probe.onerror = () => setOk(false)
    probe.src = src
    return () => {
      probe.onerror = null
    }
  }, [src])
  return ok
}

const PORTRAIT = 40
/** poe.ninja's portraits are 87x70 with the art in the top-left 82x64 and a transparent
 *  strip below and to the right. Sized by the art, the strip hangs below the square
 *  (clipped) instead of leaving the art high with a gap under it. */
const PORTRAIT_STRIP = PORTRAIT * (70 / 64 - 1)

/** Square portrait in Scalpel's icon glow; falls back to the class initial. */
function Portrait({ characterClass }: { characterClass: string }): JSX.Element {
  const src = portraitUrl(characterClass)
  const loads = useImageLoads(src)
  if (!loads) {
    return (
      <div
        className="w-10 h-10 shrink-0 rounded-[4px] border border-border flex items-center justify-center bg-black/30 text-accent font-bold"
        aria-hidden
      >
        {characterClass.charAt(0)}
      </div>
    )
  }
  return (
    <IconGlow
      src={src}
      size={PORTRAIT}
      blur={14}
      opacity={0.6}
      objectFit="cover"
      alt={characterClass}
      imgStyle={{
        height: PORTRAIT + PORTRAIT_STRIP,
        alignSelf: 'flex-start',
        // Centre the 82px-wide art rather than the 87px canvas.
        objectPosition: '39% top',
        clipPath: `inset(0 0 ${PORTRAIT_STRIP}px 0 round 4px)`,
      }}
    />
  )
}

/** The hero under the nav, as on Scalpel's filter tab (ItemSummary): ascendancy portrait,
 *  character name, and "Level N Ascendancy" on the darker card background. */
export function CharacterHeader({ snapshot }: { snapshot: StreamSnapshot }): JSX.Element {
  const { character } = snapshot
  return (
    <div className="bg-bg-card border-b border-border flex gap-[10px] items-center overflow-hidden px-3 py-[10px] shrink-0">
      <Portrait characterClass={character.class} />
      {/* The name's line box has more room above its capitals than the level line has below
          its baseline, so bottom padding centres the glyphs, not the line boxes, on the
          portrait. Line heights stay as they are: `truncate` clips descenders on tighter ones. */}
      <div className="flex-1 flex flex-col min-w-0 pb-[3px] relative z-[1]">
        <span className="font-bold text-sm text-text truncate">{character.name ?? 'Hidden character'}</span>
        <span className="text-text-dim text-xs truncate">
          Level {character.level} {character.class}
        </span>
      </div>
    </div>
  )
}
