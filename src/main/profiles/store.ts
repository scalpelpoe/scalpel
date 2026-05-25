import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type Store from 'electron-store'
import type { AppSettings, PoeProfile, GameVariant, LegacyAppSettings } from '../../shared/types'

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
    return join(this.dir, `${id.replace(/[\\/]/g, '_')}.json`)
  }

  private normalize(raw: Partial<PoeProfile>): PoeProfile | null {
    const variant = raw.gameVariant === 2 ? 2 : raw.gameVariant === 1 ? 1 : null
    if (!raw.id || !variant) return null
    const fallback = this.defaultValues(variant)
    const now = new Date().toISOString()
    return {
      schemaVersion: 1,
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallback.name,
      gameVariant: variant,
      createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : now,
      filterDir: typeof raw.filterDir === 'string' ? raw.filterDir : '',
      filterPath: typeof raw.filterPath === 'string' ? raw.filterPath : '',
      league: typeof raw.league === 'string' && raw.league ? raw.league : fallback.league,
      tradePriceOption: raw.tradePriceOption ?? fallback.tradePriceOption,
      cheatSheets: raw.cheatSheets ?? fallback.cheatSheets,
      regexPresets: Array.isArray(raw.regexPresets) ? raw.regexPresets : [],
    }
  }

  private defaultValues(
    variant: GameVariant,
  ): Pick<PoeProfile, 'name' | 'league' | 'tradePriceOption' | 'cheatSheets'> {
    const isPoe2 = variant === 2
    return {
      name: `Path of Exile ${isPoe2 ? '2' : '1'}`,
      league: isPoe2 ? 'Fate of the Vaal' : 'Mirage',
      tradePriceOption: isPoe2 ? 'exalted_divine' : 'chaos_divine',
      cheatSheets: { globalHotkey: '', categories: [], pinned: false },
    }
  }

  listProfiles(): PoeProfile[] {
    this.ensureDir()
    const profiles: PoeProfile[] = []
    try {
      for (const f of readdirSync(this.dir)) {
        if (!f.endsWith('.json')) continue
        try {
          const data = readFileSync(join(this.dir, f), 'utf-8')
          const profile = this.normalize(JSON.parse(data) as Partial<PoeProfile>)
          if (profile) {
            profiles.push(profile)
          }
        } catch {
          /* skip invalid files */
        }
      }
    } catch {
      /* dir may not exist yet */
    }
    return profiles.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  getProfile(id: string): PoeProfile | null {
    const path = this.filePath(id)
    try {
      if (!existsSync(path)) return null
      return this.normalize(JSON.parse(readFileSync(path, 'utf-8')) as Partial<PoeProfile>)
    } catch {
      return null
    }
  }

  saveProfile(profile: PoeProfile): void {
    this.ensureDir()
    const normalized = this.normalize(profile)
    if (!normalized) return
    writeFileSync(this.filePath(normalized.id), JSON.stringify(normalized, null, 2), 'utf-8')
  }

  deleteProfile(id: string): void {
    try {
      unlinkSync(this.filePath(id))
    } catch {
      /* already gone */
    }
  }

  createDefault(variant: GameVariant): PoeProfile {
    const defaults = this.defaultValues(variant)
    const now = new Date().toISOString()
    return {
      schemaVersion: 1,
      id: randomUUID(),
      name: defaults.name,
      gameVariant: variant,
      createdAt: now,
      updatedAt: now,
      filterDir: '',
      filterPath: '',
      league: defaults.league,
      tradePriceOption: defaults.tradePriceOption,
      cheatSheets: defaults.cheatSheets,
      regexPresets: [],
    }
  }

  createProfile(input: { name: string; gameVariant: GameVariant; cloneFromId?: string }): PoeProfile {
    const source = input.cloneFromId ? this.getProfile(input.cloneFromId) : null
    if (input.cloneFromId && !source) throw new Error('Profile not found')
    const now = new Date().toISOString()
    const base = source ? (JSON.parse(JSON.stringify(source)) as PoeProfile) : this.createDefault(input.gameVariant)
    const profile: PoeProfile = {
      ...base,
      id: randomUUID(),
      name: input.name.trim() || (source ? `${source.name} copy` : base.name),
      createdAt: now,
      updatedAt: now,
    }
    profile.schemaVersion = 1
    profile.gameVariant = source?.gameVariant ?? input.gameVariant
    profile.createdAt = now
    profile.updatedAt = now
    this.saveProfile(profile)
    return profile
  }

  renameProfile(id: string, name: string): PoeProfile | null {
    const profile = this.getProfile(id)
    if (!profile) return null
    profile.name = name.trim() || profile.name
    profile.updatedAt = new Date().toISOString()
    this.saveProfile(profile)
    return profile
  }

  touchProfile(id: string): PoeProfile | null {
    const profile = this.getProfile(id)
    if (!profile) return null
    profile.updatedAt = new Date().toISOString()
    this.saveProfile(profile)
    return profile
  }

  /** Seed profiles from the legacy per-version mirror keys stored in electron-store.
   *  Returns the created profiles so the caller can pick the active one. */
  migrateFromLegacy(appStore: Store<AppSettings>): PoeProfile[] {
    const store = appStore as unknown as Store<AppSettings & LegacyAppSettings>
    const created: PoeProfile[] = []
    const hasPoe1Data =
      Boolean(store.get('filterPathPoe1') || store.get('filterDirPoe1')) || Boolean(store.get('filterPath'))
    const hasPoe2Data = Boolean(store.get('filterPathPoe2') || store.get('filterDirPoe2'))

    if (hasPoe1Data) {
      const poe1 = this.createDefault(1)

      poe1.filterPath = store.get('filterPathPoe1') || store.get('filterPath') || ''
      poe1.filterDir = store.get('filterDirPoe1') || store.get('filterDir') || ''
      poe1.league = store.get('leaguePoe1') ?? poe1.league
      poe1.tradePriceOption = store.get('tradePriceOptionPoe1') ?? poe1.tradePriceOption
      poe1.cheatSheets = store.get('cheatSheetsPoe1') ?? poe1.cheatSheets
      poe1.regexPresets = store.get('regexPresetsPoe1') ?? []
      this.saveProfile(poe1)
      created.push(poe1)
    }

    if (hasPoe2Data) {
      const poe2 = this.createDefault(2)

      poe2.filterPath = store.get('filterPathPoe2') ?? ''
      poe2.filterDir = store.get('filterDirPoe2') ?? ''
      poe2.league = store.get('leaguePoe2') ?? poe2.league
      poe2.tradePriceOption = store.get('tradePriceOptionPoe2') ?? poe2.tradePriceOption
      poe2.cheatSheets = store.get('cheatSheetsPoe2') ?? poe2.cheatSheets
      poe2.regexPresets = store.get('regexPresetsPoe2') ?? []
      this.saveProfile(poe2)
      created.push(poe2)
    }

    return created
  }
}
