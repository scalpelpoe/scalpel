// Types copied verbatim from poe.re (veiset/poe-vendor-string): Itembase from
// pages/item/ItemBaseSelector.tsx, RareModSelection from pages/item/RareItemSelect.tsx,
// SelectedMagicMod from pages/item/MagicItemSelect.tsx, ItemCraftingSettings from
// utils/SavedSettings.ts (customText retained for shape fidelity; unused by the
// output functions). Dataset interfaces re-exported from the synced module
// (modulo Biome formatting applied by the pre-commit hook; semantics unchanged).
// Parity fixture support - do not edit.
import type { Affix } from '@shared/data/regex/vendor/item/GeneratedItemMods'

export type {
  Affix,
  AffixStat,
  ItemAffixRegex,
  CategoryRegex,
  ItemRegex,
} from '@shared/data/regex/vendor/item/GeneratedItemMods'

export type Rarity = 'Magic' | 'Rare'

export interface Itembase {
  baseType: string
  item: string
  rarity: Rarity
}

export type RareModSelection = {
  itembase: Itembase
  selected: boolean
  values: {
    [key: number]: string
  }
}

export type AffixType = 'PREFIX' | 'SUFFIX'

export interface SelectedMagicMod {
  basetype: string
  category: string
  regex: Affix
  affix: AffixType
  desc: string
}

export interface ItemCraftingSettings {
  itembase: Itembase | undefined
  selectedRareMods: { [p: string]: RareModSelection }
  selectedMagicMods: SelectedMagicMod[]
  rareSettings: {
    matchAnyMod: boolean
    matchPrefixAndSuffix: boolean
  }
  magicSettings: {
    onlyIfBothPrefixAndSuffix: boolean
    matchOpenAffix: boolean
  }
  customText: {
    value: string
    enabled: boolean
  }
}
