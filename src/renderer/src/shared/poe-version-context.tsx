import { createContext, useContext, type ReactNode } from 'react'
import type { GameVariant } from '@shared/types'

/** React context for the current PoE game version. Reading via usePoeVersion()
 *  avoids prop-drilling through deep trees (overlay -> FilterPanel -> ItemSummary
 *  -> PriceChip, etc.). The provider's `version` prop is the source of truth and
 *  updates live on an in-process game switch (experimental multi-window), so
 *  feed it a value that tracks the switch rather than caching at mount. Default
 *  is 1 to keep legacy renders working if a caller forgets the provider. */
const PoeVersionContext = createContext<GameVariant>(1)

export function PoeVersionProvider({
  version,
  children,
}: {
  version: GameVariant | null
  children: ReactNode
}): JSX.Element {
  return <PoeVersionContext.Provider value={version ?? 1}>{children}</PoeVersionContext.Provider>
}

export function usePoeVersion(): GameVariant {
  return useContext(PoeVersionContext)
}
