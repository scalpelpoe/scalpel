export type TimelessTreeState = {
  jewelType: number
  jewelName: string
  conqueror: string
  seed: number
  socketSkillId: number | null
}

export const DEFAULT_TIMELESS_STATE: TimelessTreeState = {
  jewelType: 1,
  jewelName: 'Glorious Vanity',
  conqueror: 'Doryani',
  seed: 1000,
  socketSkillId: null,
}
