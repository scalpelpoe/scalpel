export type AtlasModifier = 'none' | 'blockable' | 'boostable'

export interface ScarabDef {
  id: string
  name: string
  weight: number
  signature: string
  limit: number | null
}

export interface ScarabCategory {
  id: string
  name: string
  atlasModifier: AtlasModifier
  investmentBoost: boolean
  scarabs: ScarabDef[]
}

export interface ScarabCatalog {
  version: number
  vendorCategoryOrder: string[]
  categories: ScarabCategory[]
}

export type TabId = 'calculator' | 'vendor' | 'weights'

export interface ScarabCalcState {
  remarkableRelics: boolean
  blocked: string[]
  boosted: string[]
  invested: string[]
  weightOverrides: Record<string, number>
  priceOverrides: Record<string, number>
}
