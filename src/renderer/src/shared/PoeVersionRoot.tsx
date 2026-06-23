import { useEffect, useState, type ReactNode } from 'react'
import { PoeVersionProvider } from './poe-version-context'
import { CurrencyLabelsProvider } from './currency-labels-context'

/** Loads current PoE version + a11y settings from the main process on mount
 *  and exposes them via PoeVersionProvider + CurrencyLabelsProvider. Used by
 *  secondary-overlay entry points whose renderers need version context (for
 *  hooks like useStickyZone, usePoeVersion). Renders children with version=1
 *  and labels-as-text=false until the first settings response lands, matching
 *  both contexts' defaults. Re-subscribes to poe-version and the currency-label
 *  toggle so secondary overlays stay correct after an in-process game switch
 *  (experimental multi-window), where there is no relaunch to reset them. */
export function PoeVersionRoot({ children }: { children: ReactNode }): JSX.Element {
  const [version, setVersion] = useState<1 | 2>(1)
  const [currencyLabelsAsText, setCurrencyLabelsAsText] = useState(false)
  useEffect(() => {
    void window.api.getSettings().then((s) => {
      setVersion(s.poeVersion ?? 1)
      setCurrencyLabelsAsText(Boolean(s.currencyLabelsAsText))
    })
    const unsubVersion = window.api.onPoeVersion((v) => setVersion(v))
    const unsubSetting = window.api.onSettingUpdated((key, value) => {
      if (key === 'currencyLabelsAsText') setCurrencyLabelsAsText(Boolean(value))
    })
    return () => {
      unsubVersion()
      unsubSetting()
    }
  }, [])
  return (
    <PoeVersionProvider version={version}>
      <CurrencyLabelsProvider value={currencyLabelsAsText}>{children}</CurrencyLabelsProvider>
    </PoeVersionProvider>
  )
}
