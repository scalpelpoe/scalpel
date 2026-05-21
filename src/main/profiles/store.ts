import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type Store from 'electron-store'
import type { AppSettings, PoeProfile, GameVariant } from '../../shared/types'

let _instance: ProfileStore | null = null

export function getProfileStore(): ProfileStore {
  if (!_instance) throw new Error('ProfileStore not initialized')
  return _instance
}

export function initProfileStore(userDataPath: string): ProfileStore {
  _instance = new ProfileStore(userDataPath)
  return _instance
}

export class ProfileStore {
  private dir: string

  constructor(userDataPath: string) {
    this.dir = join(userDataPath, 'profiles')
  }

  ensureDir(): void {
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true })
    }
  }

  private filePath(id: string): string {
    return join(this.dir, `${id}.json`)
  }

  listProfiles(): PoeProfile[] {
    this.ensureDir()
    const profiles: PoeProfile[] = []
    try {
      for (const f of readdirSync(this.dir)) {
        if (!f.endsWith('.json')) continue
        try {
          const data = readFileSync(join(this.dir, f), 'utf-8')
          const profile = JSON.parse(data) as PoeProfile
          if (profile.id && profile.gameVariant !== undefined) {
            profiles.push(profile)
          }
        } catch {
          /* skip invalid files */
        }
      }
    } catch {
      /* dir may not exist yet */
    }
    return profiles
  }

  getProfile(id: string): PoeProfile | null {
    const path = this.filePath(id)
    try {
      if (!existsSync(path)) return null
      return JSON.parse(readFileSync(path, 'utf-8')) as PoeProfile
    } catch {
      return null
    }
  }

  saveProfile(profile: PoeProfile): void {
    this.ensureDir()
    writeFileSync(this.filePath(profile.id), JSON.stringify(profile, null, 2), 'utf-8')
  }

  createDefault(variant: GameVariant): PoeProfile {
    const isPoe2 = variant === 2
    return {
      id: randomUUID(),
      name: `Path of Exile ${isPoe2 ? '2' : '1'}`,
      gameVariant: variant,
      filterDir: '',
      filterPath: '',
      league: isPoe2 ? 'Fate of the Vaal' : 'Mirage',
      tradePriceOption: isPoe2 ? 'exalted_divine' : 'chaos_divine',
      cheatSheets: { globalHotkey: '', categories: [], pinned: false },
      regexPresets: [],
    }
  }

  /** Seed profiles from the legacy per-version mirror keys stored in electron-store.
   *  Returns the created profiles so the caller can pick the active one. */
  migrateFromLegacy(appStore: Store<AppSettings>): PoeProfile[] {
    const poe1 = this.createDefault(1)
    const poe2 = this.createDefault(2)

    poe1.filterPath = appStore.get('filterPathPoe1') ?? ''
    poe1.filterDir = appStore.get('filterDirPoe1') ?? ''
    poe1.league = appStore.get('leaguePoe1') ?? poe1.league
    poe1.tradePriceOption = appStore.get('tradePriceOptionPoe1') ?? poe1.tradePriceOption
    poe1.cheatSheets = appStore.get('cheatSheetsPoe1') ?? poe1.cheatSheets
    poe1.regexPresets = appStore.get('regexPresetsPoe1') ?? []

    poe2.filterPath = appStore.get('filterPathPoe2') ?? ''
    poe2.filterDir = appStore.get('filterDirPoe2') ?? ''
    poe2.league = appStore.get('leaguePoe2') ?? poe2.league
    poe2.tradePriceOption = appStore.get('tradePriceOptionPoe2') ?? poe2.tradePriceOption
    poe2.cheatSheets = appStore.get('cheatSheetsPoe2') ?? poe2.cheatSheets
    poe2.regexPresets = appStore.get('regexPresetsPoe2') ?? []

    this.saveProfile(poe1)
    this.saveProfile(poe2)

    return [poe1, poe2]
  }
}
