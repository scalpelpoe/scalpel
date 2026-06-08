export interface RegexPresetTag {
  text: string
  color: string
  source?: 'qualifier' | 'avoid' | 'want' | 'custom' | 'flask'
  sourceId?: string | number
}

export interface RegexPreset {
  id: string
  name?: string
  color?: string
  generator?: string
  tags?: RegexPresetTag[]
  avoid: number[]
  want: number[]
  wantMode: 'any' | 'all'
  qualifiers: Record<string, number>
  wantValues?: Record<number, number>
  avoidValues?: Record<number, number>
  nightmare: boolean
  customRegex?: string
  regex?: string
  selectedPrefix?: string[]
  selectedSuffix?: string[]
  flaskIlevel?: number
  flaskHighestOnly?: boolean
  flaskMatchBoth?: boolean
  flaskMatchOpen?: boolean
  flaskIgnoreEffectTiers?: boolean
}
