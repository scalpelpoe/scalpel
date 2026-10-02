import { resolveCssVars } from '@shared/theme/derive'
import type { ThemePalette } from '@shared/theme/palette'
import { PRESETS_BY_ID } from '@shared/theme/presets'
import type { StreamState } from '../data/use-stream'
import { createContext, type CSSProperties, type ReactNode, useContext, useMemo } from 'react'

/** The palette viewers see until a snapshot brings the streamer's own theme. */
const DEFAULT_PALETTE = PRESETS_BY_ID.poe2.palette

/** Scalpel's theme engine output as inline custom properties, so the theme styles the
 *  viewer's subtree only (Storybook shares one document with Scalpel's own stories). */
export const defaultThemeVars = resolveCssVars(DEFAULT_PALETTE) as CSSProperties

/** The vars ViewerRoot applied, for portaled content (the floating rune card) that
 *  renders outside the root's DOM subtree. */
export const ThemeVarsContext = createContext<CSSProperties>(defaultThemeVars)

export const useThemeVars = (): CSSProperties => useContext(ThemeVarsContext)

/** The streamer's theme once a snapshot has loaded; loading and not-set-up states keep the default. */
export const themeOf = (state: StreamState): ThemePalette | undefined =>
  state.status === 'ready' ? state.snapshot.theme : undefined

/** Root of every viewer surface: applies the streamer's theme (poe2 when the snapshot
 *  has none) and base type. */
export function ViewerRoot({
  theme,
  className,
  style,
  children,
}: {
  theme?: ThemePalette
  className?: string
  style?: CSSProperties
  children?: ReactNode
}): JSX.Element {
  const vars = useMemo(() => (theme ? (resolveCssVars(theme) as CSSProperties) : defaultThemeVars), [theme])
  return (
    <ThemeVarsContext.Provider value={vars}>
      <div className={className ? `ssv-root ${className}` : 'ssv-root'} style={{ ...vars, ...style }}>
        {children}
      </div>
    </ThemeVarsContext.Provider>
  )
}
