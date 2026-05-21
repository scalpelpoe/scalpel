import { createContext, useContext, type ReactNode } from 'react'
import type { GameVariant } from '../../../shared/types'

/** React context for the current PoE game version. Reading via usePoeVersion()
 *  avoids prop-drilling through deep trees (overlay -> FilterPanel -> ItemSummary
 *  -> PriceChip, etc.). Version is stable for the process lifetime since game
 *  switches trigger app.relaunch, so consumers don't need memoization. Default
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
