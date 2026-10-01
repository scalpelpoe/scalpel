import { resolveCssVars } from '@shared/theme/derive'
import { PRESETS_BY_ID } from '@shared/theme/presets'
import type { CSSProperties, ReactNode } from 'react'

/** The Scalpel theme every viewer surface renders in. */
const VIEWER_THEME = 'poe2'

/** Scalpel's theme engine output as inline custom properties, so the theme styles the
 *  viewer's subtree only (Storybook shares one document with Scalpel's own stories). */
export const themeVars = resolveCssVars(PRESETS_BY_ID[VIEWER_THEME].palette) as CSSProperties

/** Root of every viewer surface: applies the viewer theme and base type. */
export function ViewerRoot({
  className,
  style,
  children,
}: {
  className?: string
  style?: CSSProperties
  children?: ReactNode
}): JSX.Element {
  return (
    <div className={className ? `ssv-root ${className}` : 'ssv-root'} style={{ ...themeVars, ...style }}>
      {children}
    </div>
  )
}
