export type Step =
  | 'welcome'
  | 'filter-folder-poe1'
  | 'filter-poe1'
  | 'online-filter-setup-poe1'
  | 'filter-folder-poe2'
  | 'filter-poe2'
  | 'online-filter-setup-poe2'
  | 'hotkey'
  | 'pricecheck-hotkey'
  | 'trade-login'
  | 'preferences'
  | 'done'
  | 'settings'

export const STEP_ORDER: Step[] = [
  'welcome',
  'filter-folder-poe1',
  'filter-poe1',
  'online-filter-setup-poe1',
  'filter-folder-poe2',
  'filter-poe2',
  'online-filter-setup-poe2',
  'hotkey',
  'pricecheck-hotkey',
  'trade-login',
  'preferences',
  'done',
  'settings',
]

export type SelectedGames = { poe1: boolean; poe2: boolean }

/** Total visible onboarding steps for a given game selection.
 *  4 shared (hotkey, price-check hotkey, trade login, preferences) + 2 per game (folder, filter). */
export function totalOnboardingSteps(games: SelectedGames): number {
  const gameCount = (games.poe1 ? 1 : 0) + (games.poe2 ? 1 : 0)
  return 4 + 2 * Math.max(gameCount, 1)
}
