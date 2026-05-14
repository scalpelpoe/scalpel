// Read the iconMap and divCardArtMap that Scalpel publishes to globalThis at
// init time (see src/renderer/src/overlay/App.tsx). Returns empty fallbacks
// when called outside Scalpel (tests, dev tools).
export interface ScalpelGlobal {
  iconMap: Record<string, string>
  divCardArtMap: Map<string, string>
}

export function getScalpelGlobal(): ScalpelGlobal {
  const g = (globalThis as unknown as { __scalpel?: ScalpelGlobal }).__scalpel
  return g ?? { iconMap: {}, divCardArtMap: new Map() }
}
