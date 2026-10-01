import type { PoeItem } from '@shared/types'
import type { DefenseValues, ItemInfo } from './stat-matcher/context'
import type { TradeQueryItem } from './trade'

/** The defence values matchItemMods takes as its 3rd argument. */
export function defensesFromPoeItem(item: PoeItem): DefenseValues {
  return {
    armour: item.armour,
    evasion: item.evasion,
    energyShield: item.energyShield,
    ward: item.ward,
    block: item.block,
  }
}

/** The item-info bag matchItemMods takes as its 4th argument. */
export function itemInfoFromPoeItem(item: PoeItem): ItemInfo {
  return {
    sockets: item.sockets,
    linkedSockets: item.linkedSockets,
    quality: item.quality,
    itemLevel: item.itemLevel,
    baseType: item.baseType,
    rarity: item.rarity,
    itemClass: item.itemClass,
    name: item.name,
    gemLevel: item.gemLevel,
    corrupted: item.corrupted,
    mirrored: item.mirrored,
    sanctified: item.sanctified,
    identified: item.identified,
    influence: item.influence,
    mapTier: item.mapTier,
    mapQuantity: item.mapQuantity,
    mapRarity: item.mapRarity,
    mapPackSize: item.mapPackSize,
    mapMoreScarabs: item.mapMoreScarabs,
    mapMoreCurrency: item.mapMoreCurrency,
    mapMoreMaps: item.mapMoreMaps,
    mapMoreDivCards: item.mapMoreDivCards,
    mapRevives: item.mapRevives,
    mapDropChance: item.mapDropChance,
    mapGold: item.mapGold,
    mapMagicMonsters: item.mapMagicMonsters,
    mapRareMonsters: item.mapRareMonsters,
    enchants: item.enchants,
    runes: item.runes,
    imbues: item.imbues,
    grantedSkills: item.grantedSkills,
    memoryStrands: item.memoryStrands,
    intangibility: item.intangibility,
    physDamageMin: item.physDamageMin,
    physDamageMax: item.physDamageMax,
    eleDamageAvg: item.eleDamageAvg,
    chaosDamageAvg: item.chaosDamageAvg,
    attacksPerSecond: item.attacksPerSecond,
    critChance: item.critChance,
    heistJobs: item.heistJobs,
    heistTarget: item.heistTarget,
    monsterLevel: item.monsterLevel,
    wingsRevealed: item.wingsRevealed,
    wingsTotal: item.wingsTotal,
    mapReward: item.mapReward,
    transfigured: item.transfigured,
    synthesised: item.synthesised,
    vestigial: item.vestigial,
    foulborn: item.foulborn,
    zanaMemory: item.zanaMemory,
    logbookFactions: item.logbookFactions,
    logbookBosses: item.logbookBosses,
    atzoatlRooms: item.atzoatlRooms,
    atzoatlOpenCount: item.atzoatlOpenCount,
    storedExperience: item.storedExperience,
    ultimatumChallenge: item.ultimatumChallenge,
    ultimatumRewardText: item.ultimatumRewardText,
    ultimatumRequired: item.ultimatumRequired,
    isSynthetic: item.isSynthetic,
    unidentifiedTier: item.unidentifiedItemTier,
    chartZone: item.chartZone,
    chartShape: item.chartShape,
    scryingArea: item.scryingArea,
    mercenaryBuild: item.mercenaryBuild,
    mercenaryLevel: item.mercenaryLevel,
    mercenarySkills: item.mercenarySkills,
    requiredLevel: item.requiredLevel,
  }
}

/** The item shape searchTrade and buildTradeQuery take, as the price-check renderer sends it. */
export function tradeItemFromPoeItem(item: PoeItem): TradeQueryItem {
  return {
    name: item.name,
    baseType: item.baseType,
    itemClass: item.itemClass,
    rarity: item.rarity,
    armour: item.armour,
    evasion: item.evasion,
    energyShield: item.energyShield,
    ward: item.ward,
    block: item.block,
    vaalGem: item.vaalGem,
  }
}
