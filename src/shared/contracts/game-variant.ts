export type GameVariant = 1 | 2

export const GAME_TITLES: Record<GameVariant, string> = {
  1: 'Path of Exile',
  2: 'Path of Exile 2',
}

export const TITLE_TO_VARIANT: Record<string, GameVariant> = {
  'Path of Exile': 1,
  'Path of Exile 2': 2,
}

export function gameDisplayName(variant: GameVariant): string {
  return variant === 2 ? 'Path of Exile 2' : 'Path of Exile'
}

export function gameShortName(variant: GameVariant): string {
  return `PoE${variant}`
}
