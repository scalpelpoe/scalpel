export type BuiltinView =
  | 'idle'
  | 'item'
  | 'no-filter'
  | 'no-item'
  | 'setup'
  | 'audit'
  | 'tools'
  | 'dust'
  | 'divcards'
  | 'scarabs'
  | 'pricecheck'
  | 'regex'
  | 'extras'

export type View = BuiltinView | `plugin:${string}`
