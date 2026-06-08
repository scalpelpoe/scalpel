/* Minimal slice of poe2.re's Settings type, scoped to just the `waystone` key
 * needed by `generateWaystoneRegex`. Trimmed from src/app/settings.ts. */
import type { SelectOption } from './SelectOption'

export interface ResultSettings {
  customText: string
  autoCopy: boolean
}

export interface Settings {
  waystone: {
    resultSettings: ResultSettings
    tier: {
      min: number
      max: number
    }
    rarity: {
      corrupted: boolean
      uncorrupted: boolean
    }
    modifier: {
      over100: boolean
      round10: boolean
      dropOverX: boolean
      dropOverValue: number
      delirious: boolean
      anyPack: boolean
      prefixSelectType: string
      prefixes: SelectOption[]
      suffixes: SelectOption[]
    }
  }
  vendor: {
    resultSettings: ResultSettings
    itemProperty: { quality: boolean; sockets: boolean }
    itemType: { rare: boolean; magic: boolean; normal: boolean }
    resistances: { fire: boolean; cold: boolean; lightning: boolean; chaos: boolean }
    movementSpeed: { move30: boolean; move25: boolean; move20: boolean; move15: boolean; move10: boolean }
    itemMods: {
      physical: boolean
      spellDamage: boolean
      elemental: boolean
      coldDamage: boolean
      fireDamage: boolean
      lightningDamage: boolean
      chaosDamage: boolean
      spirit: boolean
      rarity: boolean
      maxLife: boolean
      maxMana: boolean
      attackSpeed: boolean
      castSpeed: boolean
      skillLevel: boolean
      skillLevelMinion: boolean
      skillLevelMelee: boolean
      skillLevelSpell: boolean
      skillLevelFire: boolean
      skillLevelCold: boolean
      skillLevelLightning: boolean
      skillLevelPhysical: boolean
      skillLevelProjectile: boolean
      strength: boolean
      intelligence: boolean
      dexterity: boolean
    }
    itemClass: {
      amulets: boolean
      rings: boolean
      belts: boolean
      daggers: boolean
      wands: boolean
      oneHandMaces: boolean
      sceptres: boolean
      bows: boolean
      staves: boolean
      twoHandMaces: boolean
      quarterstaves: boolean
      spears: boolean
      crossbows: boolean
      talisman: boolean
      gloves: boolean
      boots: boolean
      bodyArmours: boolean
      helmets: boolean
      quivers: boolean
      foci: boolean
      shields: boolean
    }
    itemLevel: { min: number; max: number }
    characterLevel: { min: number; max: number }
  }
  tablet: {
    resultSettings: ResultSettings
    rarity: { normal: boolean; magic: boolean }
    type: {
      breach: boolean
      delirium: boolean
      irradiated: boolean
      expedition: boolean
      ritual: boolean
      overseer: boolean
    }
    modifier: {
      usesRemaining: boolean
      numUsesRemaining: number
      affixes: SelectOption[]
      affixSelectType: string
      round10: boolean
    }
  }
}
