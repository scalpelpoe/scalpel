// src/main/filter/intents.ts

export interface MoveBaseTypePayload {
  value: string
  fromTier: string
}

export interface SetVisibilityPayload {
  visibility: 'Show' | 'Hide' | 'Minimal'
}

export interface SetThresholdPayload {
  condition: 'StackSize' | 'Quality' | 'MemoryStrands'
  operator: string
  value: number
}

export interface SetActionPayload {
  action: string
  values: string[]
}

export type IntentPayload =
  | { type: 'move-basetype'; payload: MoveBaseTypePayload }
  | { type: 'set-visibility'; payload: SetVisibilityPayload }
  | { type: 'set-threshold'; payload: SetThresholdPayload }
  | { type: 'set-action'; payload: SetActionPayload }

export interface Intent {
  type: 'move-basetype' | 'set-visibility' | 'set-threshold' | 'set-action'
  target: { typePath: string; tier: string }
  payload: MoveBaseTypePayload | SetVisibilityPayload | SetThresholdPayload | SetActionPayload
  timestamp: number
}

export interface IntentLog {
  filterName: string
  intents: Intent[]
}
