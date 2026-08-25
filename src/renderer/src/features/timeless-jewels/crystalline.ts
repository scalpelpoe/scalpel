/** Thin wrappers around Vilsol's crystalline-exposed Go WASM API. */

export type JewelType = 1 | 2 | 3 | 4 | 5 | 6

export interface TimelessJewelConqueror {
  Index: number
  Version: number
}

export interface AlternatePassiveSkill {
  Index: number
  ID: string
  Name: string
  StatsKeys?: number[]
  Stat1Min: number
  Stat1Max: number
  Stat2Min: number
  Stat2Max: number
  Stat3Min: number
  Stat3Max: number
  Stat4Min: number
  Stat4Max: number
}

export interface AlternatePassiveAddition {
  Index: number
  ID: string
  StatsKeys?: number[]
  Stat1Min: number
  Stat1Max: number
  Stat2Min: number
  Stat2Max: number
}

export interface AlternatePassiveAdditionInformation {
  AlternatePassiveAddition?: AlternatePassiveAddition
  StatRolls?: number[]
}

export interface AlternatePassiveSkillInformation {
  AlternatePassiveSkill?: AlternatePassiveSkill
  StatRolls?: number[]
  AlternatePassiveAdditionInformations?: AlternatePassiveAdditionInformation[]
}

export interface PassiveSkill {
  Index: number
  ID: string
  StatIndices?: number[]
  PassiveSkillGraphID: number
  Name: string
  IsKeystone: boolean
  IsNotable: boolean
  IsJewelSocket: boolean
}

export interface Stat {
  Index: number
  ID: string
  Text: string
}

export interface SeedRange {
  Min: number
  Max: number
  Special: boolean
}

export interface CalculatorApi {
  Calculate: (
    passiveID: number,
    seed: number,
    timelessJewelType: number,
    conqueror: string,
  ) => AlternatePassiveSkillInformation
  ReverseSearch: (
    passiveIDs: number[] | undefined,
    statIDs: number[] | undefined,
    timelessJewelType: number,
    conqueror: string,
    updates: (progress: number) => Promise<void>,
  ) => Promise<Record<number, Record<number, Record<number, number>>> | undefined>
}

export interface DataApi {
  GetAlternatePassiveAdditionByIndex: (index: number) => AlternatePassiveAddition | undefined
  GetAlternatePassiveSkillByIndex: (index: number) => AlternatePassiveSkill | undefined
  GetPassiveSkillByIndex: (index: number) => PassiveSkill | undefined
  GetStatByIndex: (index: number) => Stat | undefined
  PassiveSkillAuraStatTranslationsJSON: string
  PassiveSkillStatTranslationsJSON: string
  PassiveSkills: PassiveSkill[]
  PossibleStats: string
  SkillTree: string
  StatTranslationsJSON: string
  TimelessJewelConquerors: Record<number, Record<string, TimelessJewelConqueror>>
  TimelessJewelSeedRanges: Record<number, SeedRange>
  TimelessJewels: Record<number, string>
  TreeToPassive: Record<number, PassiveSkill>
}

declare global {
  // Go WASM runtime (wasm_exec.js) + crystalline exposer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var Go: new () => { importObject: WebAssembly.Imports; run: (instance: WebAssembly.Instance) => Promise<void> }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var go: any
}

export let calculator: CalculatorApi | null = null
export let data: DataApi | null = null

export function initializeCrystalline(): void {
  const root = globalThis.go?.['timeless-jewels']
  if (!root) throw new Error('Timeless Jewels WASM not initialized')
  calculator = {
    Calculate: root.calculator.Calculate,
    ReverseSearch: root.calculator.ReverseSearch,
  }
  data = {
    GetAlternatePassiveAdditionByIndex: root.data.GetAlternatePassiveAdditionByIndex,
    GetAlternatePassiveSkillByIndex: root.data.GetAlternatePassiveSkillByIndex,
    GetPassiveSkillByIndex: root.data.GetPassiveSkillByIndex,
    GetStatByIndex: root.data.GetStatByIndex,
    PassiveSkillAuraStatTranslationsJSON: root.data.PassiveSkillAuraStatTranslationsJSON,
    PassiveSkillStatTranslationsJSON: root.data.PassiveSkillStatTranslationsJSON,
    PassiveSkills: root.data.PassiveSkills,
    PossibleStats: root.data.PossibleStats,
    SkillTree: root.data.SkillTree,
    StatTranslationsJSON: root.data.StatTranslationsJSON,
    TimelessJewelConquerors: root.data.TimelessJewelConquerors,
    TimelessJewelSeedRanges: root.data.TimelessJewelSeedRanges,
    TimelessJewels: root.data.TimelessJewels,
    TreeToPassive: root.data.TreeToPassive,
  }
}

export function requireData(): DataApi {
  if (!data) throw new Error('Timeless Jewels data not ready')
  return data
}

export function requireCalculator(): CalculatorApi {
  if (!calculator) throw new Error('Timeless Jewels calculator not ready')
  return calculator
}
