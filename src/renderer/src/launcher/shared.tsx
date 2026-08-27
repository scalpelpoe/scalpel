import { useEffect } from 'react'
import type { LauncherItem } from '@shared/launcher'

export function isPluginItem(action: string): boolean {
  return action.startsWith('plugin-overlay:')
}

/** Primary line on a slice/chip; full string stays in title + center on hover. */
export function shortLauncherLabel(label: string): string {
  const parts = label.split(' — ')
  const primary = parts[0]?.trim() ?? label
  const secondary = parts[1]?.trim()
  if (secondary && primary.length <= 11) return `${primary}\n${secondary.slice(0, 10)}`
  if (primary.length <= 14) return primary
  return `${primary.slice(0, 13)}…`
}

/** Compact single-line label for hub chips (always horizontal). */
export function chipLauncherLabel(label: string): string {
  const primary = (label.split(' — ')[0]?.trim() ?? label).replace(/^Scalpel\s+/i, '')
  if (primary.length <= 10) return primary
  return `${primary.slice(0, 9)}…`
}

/** Ring chips stay icon-only when possible; full label lives in the center readout. */
export function resolveChipDisplay(
  sliceMode: 'names' | 'icons' | 'both',
  item: LauncherItem,
  dense = false,
): 'icon' | 'label' {
  const hasIcon = Boolean(item.icon)
  if (hasIcon && (dense || sliceMode === 'icons' || sliceMode === 'both')) return 'icon'
  return 'label'
}

export function orbitPoint(index: number, total: number, center: number, radius: number): { x: number; y: number } {
  const mid = ((index + 0.5) / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  return {
    x: center + Math.cos(mid) * radius,
    y: center + Math.sin(mid) * radius,
  }
}

export function LauncherIcon({ html, size }: { html: string; size: number }): JSX.Element {
  return (
    <span
      className="launcher-slice-icon inline-flex items-center justify-center shrink-0 [&_svg]:block"
      style={{ width: size, height: size }}
      // Plugin / built-in icons are trusted host markup (same as title-bar tabs).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function useLauncherActions(): {
  close: () => void
  run: (action: string) => void
} {
  return {
    close: () => window.api.launcherClose(),
    run: (action: string) => window.api.launcherRun(action),
  }
}

export function useLauncherEscape(close: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])
}

export type { LauncherItem }
