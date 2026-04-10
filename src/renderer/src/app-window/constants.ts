export type Step =
  | 'welcome'
  | 'filter-folder'
  | 'filter'
  | 'online-filter-setup'
  | 'hotkey'
  | 'pricecheck-hotkey'
  | 'trade-login'
  | 'preferences'
  | 'done'
  | 'settings'

export const STEP_ORDER: Step[] = [
  'welcome',
  'filter-folder',
  'filter',
  'online-filter-setup',
  'hotkey',
  'pricecheck-hotkey',
  'trade-login',
  'preferences',
  'done',
  'settings',
]
export const TOTAL_ONBOARDING_STEPS = 6
