/** Pure routing helpers for onboarding. AppWindow holds the state; this
 *  module exists so the "what step is next given X" logic is unit-testable
 *  without React + IPC mocks. */

import type { SelectedGames, Step } from './constants'

/** Games the user picked, in flow order. */
export function selectedGameOrder(games: SelectedGames): Array<1 | 2> {
  const result: Array<1 | 2> = []
  if (games.poe1) result.push(1)
  if (games.poe2) result.push(2)
  return result
}

export function filterFolderStepFor(game: 1 | 2): Step {
  return game === 1 ? 'filter-folder-poe1' : 'filter-folder-poe2'
}

export function filterStepFor(game: 1 | 2): Step {
  return game === 1 ? 'filter-poe1' : 'filter-poe2'
}

export function onlineSetupStepFor(game: 1 | 2): Step {
  return game === 1 ? 'online-filter-setup-poe1' : 'online-filter-setup-poe2'
}

/** Step number to render in the StepHeader for a given game's folder/filter
 *  step. When both games are selected the step count doubles for the filter
 *  portion of the flow. */
export function filterStepNum(games: SelectedGames, game: 1 | 2, which: 'folder' | 'filter'): number {
  const both = games.poe1 && games.poe2
  const offset = which === 'folder' ? 1 : 2
  if (both && game === 2) return offset + 2
  return offset
}

/** First step number after the per-game filter setup. With both games picked
 *  the filter portion is steps 1-4, so shared (hotkey etc.) starts at 5. With
 *  one game it's 1-2, shared starts at 3. */
export function sharedStepBase(games: SelectedGames): number {
  return games.poe1 && games.poe2 ? 4 : 2
}

/** Where the user goes after picking a filter for `game`: into online setup
 *  if they imported a fresh online filter, otherwise on to the next game's
 *  filter folder (if any) or to the shared `hotkey` step. */
export function nextStepAfterFilter(
  game: 1 | 2,
  games: SelectedGames,
  importedOnline: { poe1: string | null; poe2: string | null },
): Step {
  if (importedOnline[game === 1 ? 'poe1' : 'poe2']) return onlineSetupStepFor(game)
  return nextStepAfterOnlineSetup(game, games)
}

/** Where the user goes after the online-filter-setup or after deciding not to
 *  import: the next game's filter folder if there is one, else `hotkey`. */
export function nextStepAfterOnlineSetup(game: 1 | 2, games: SelectedGames): Step {
  if (game === 1 && games.poe2) return 'filter-folder-poe2'
  return 'hotkey'
}

/** Where the user goes when pressing Back on the second game's filter folder.
 *  If the first game was set up they return to its last completed step;
 *  otherwise straight back to welcome (single-game flow). */
export function backStepFromFilterFolder(
  game: 1 | 2,
  games: SelectedGames,
  importedOnline: { poe1: string | null; poe2: string | null },
): Step {
  if (game === 1) return 'welcome'
  if (games.poe1) return importedOnline.poe1 ? 'online-filter-setup-poe1' : 'filter-poe1'
  return 'welcome'
}

/** Where the user goes when pressing Back on the hotkey step: the last step
 *  of whichever game was set up most recently. */
export function backStepFromHotkey(
  games: SelectedGames,
  importedOnline: { poe1: string | null; poe2: string | null },
): Step {
  const lastGame: 1 | 2 = games.poe2 ? 2 : 1
  const importedKey = lastGame === 1 ? 'poe1' : 'poe2'
  return importedOnline[importedKey] ? onlineSetupStepFor(lastGame) : filterStepFor(lastGame)
}
