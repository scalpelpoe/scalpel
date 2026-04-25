import { AddOne, Forbid, CheckOne } from '@icon-park/react'
import type { RegexPresetTag } from '../../../../shared/types'

/** Shared palette for the regex-tool UI. Keyed by semantic role so every tab / list /
 *  tag that wants "the avoid color" resolves to the same hex, re-themeable from one
 *  place. Sub-components import only the keys they use. */
export const TAB_COLORS = {
  qualifiers: '#81c784',
  avoid: '#ef5350',
  want: '#81c784',
  nightmare: '#b71c1c',
  custom: '#90a4ae',
} as const

/** Collapse mod roll-range numbers to `#` so two rolls of the same mod compare as equal. */
export function formatModText(text: string): string {
  return text.replace(/\d+[-to ]*\d*%/g, '#%').replace(/\d+[-to ]*\d+/g, '#')
}

/** Read a JSON value from localStorage with a fallback + optional custom parser. The
 *  custom parser is useful for string-valued keys that shouldn't be JSON.parse'd. */
export function loadStorage<T>(key: string, fallback: T, parse: (s: string) => T = JSON.parse): T {
  try {
    const saved = localStorage.getItem(key)
    return saved != null ? parse(saved) : fallback
  } catch {
    return fallback
  }
}

/** Read an array-of-numbers value and rehydrate it as a Set. */
export function loadSet(key: string): Set<number> {
  return new Set(loadStorage<number[]>(key, []))
}

const CUSTOM_TAG_TEXT = '#E40000'

/** Inline styles for a preset-tag chip. Custom-source tags render as a white pill with
 *  a red border/text; other sources paint the chip using the tag's own color. */
export function tagChipStyle(tag: RegexPresetTag): React.CSSProperties {
  const isCustom = !tag.source || tag.source === 'custom'
  return {
    background: isCustom ? '#fff' : `${tag.color}cc`,
    color: isCustom ? CUSTOM_TAG_TEXT : '#fff',
    border: isCustom ? `1px solid ${CUSTOM_TAG_TEXT}` : undefined,
    borderRadius: 2,
    textShadow: isCustom ? undefined : '0 1px 2px rgba(0,0,0,0.4)',
  }
}

/** Icon for a preset tag source type (qualifier / avoid / want). */
export function TagSourceIcon({ source, size = 12 }: { source?: string; size?: number }): JSX.Element | null {
  const fill: [string, string] = ['currentColor', 'rgba(255,255,255,0.2)']
  const style = { marginTop: size > 10 ? 1 : 0, marginLeft: size > 10 ? -2 : -1 }
  if (source === 'qualifier') return <AddOne size={size} theme="two-tone" fill={fill} style={style} />
  if (source === 'avoid') return <Forbid size={size} theme="two-tone" fill={fill} style={style} />
  if (source === 'want') return <CheckOne size={size} theme="two-tone" fill={fill} style={style} />
  return null
}

/** Build an onMouseDown handler that adds momentum-based drag-to-scroll to a
 *  horizontally-scrolling container. Not a React hook -- no hooks are called -- so
 *  it's a plain factory; name doesn't start with `use`. Pass selectors of child
 *  elements that shouldn't initiate a drag (e.g. buttons inside the scroller). */
export function createMomentumScrollHandler(
  ignoreSelectors: string[] = [],
): (e: React.MouseEvent<HTMLDivElement>) => void {
  return (e) => {
    if (ignoreSelectors.some((s) => (e.target as HTMLElement).closest(s))) return
    const el = e.currentTarget
    const startX = e.pageX
    const scrollLeft = el.scrollLeft
    let moved = false
    let velocity = 0
    let lastX = startX
    let lastTime = Date.now()
    const onMove = (ev: MouseEvent): void => {
      const dx = ev.pageX - startX
      if (Math.abs(dx) > 3) moved = true
      const now = Date.now()
      const dt = now - lastTime
      if (dt > 0) velocity = (ev.pageX - lastX) / dt
      lastX = ev.pageX
      lastTime = now
      el.scrollLeft = scrollLeft - dx
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (!moved) return
      let v = velocity * 15
      const decay = (): void => {
        if (Math.abs(v) < 0.5) return
        el.scrollLeft -= v
        v *= 0.92
        requestAnimationFrame(decay)
      }
      requestAnimationFrame(decay)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
}
