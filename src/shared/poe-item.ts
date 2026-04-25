import type { PoeItem } from './types'

/** Build a synthetic `PoeItem` with sensible defaults. Used by any code path that needs
 *  to evaluate a filter or run a trade lookup without a real clipboard-parsed item --
 *  e.g. the item-search combobox, sister-overlay click-throughs, tier previews. */
export function defaultPoeItem(overrides: Partial<PoeItem> = {}): PoeItem {
  return {
    itemClass: '',
    rarity: 'Normal',
    name: '',
    baseType: '',
    mapTier: 0,
    itemLevel: 100,
    quality: 0,
    sockets: '',
    linkedSockets: 0,
    armour: 0,
    evasion: 0,
    energyShield: 0,
    ward: 0,
    block: 0,
    reqStr: 0,
    reqDex: 0,
    reqInt: 0,
    corrupted: false,
    identified: true,
    mirrored: false,
    synthesised: false,
    fractured: false,
    blighted: false,
    scourged: false,
    zanaMemory: false,
    implicitCount: 0,
    gemLevel: 0,
    transfigured: false,
    stackSize: 1,
    influence: [],
    explicits: [],
    implicits: [],
    areaLevel: 83,
    ...overrides,
  } as PoeItem
}
