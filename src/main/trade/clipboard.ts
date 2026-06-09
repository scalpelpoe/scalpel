import { clipboard } from 'electron'
import { getItemClasses } from '../../shared/data/items/item-classes'
import { endgameAreaLevel, SKILL_GEM_CLASSES } from '../../shared/poe-item'
import type { AdvancedMod, ItemRarity, PoeItem } from '../../shared/types'
import { getPoeVersion } from '../game-state'

// Both base-name and class-size lookups seed lazily from the active game's
// class sheet -- getPoeVersion() isn't reliable at module load (game-state
// hasn't been set yet), so we resolve on first access. registerFilterBaseTypes()
// then adds filter-discovered bases on top.
let _staticBaseTypes: Set<string> | null = null
let _filterBaseTypes = new Set<string>()

function getStaticBaseTypes(): Set<string> {
  if (_staticBaseTypes === null) {
    _staticBaseTypes = new Set(
      Object.values(getItemClasses(getPoeVersion())).flatMap((c) => c.bases.map((b) => b.name)),
    )
  }
  return _staticBaseTypes
}

function getKnownBaseTypes(): Set<string> {
  return new Set([...getStaticBaseTypes(), ..._filterBaseTypes])
}

let _itemSizes: Record<string, [number, number]> | null = null
function getItemSizes(): Record<string, [number, number]> {
  if (_itemSizes === null) {
    _itemSizes = Object.fromEntries(Object.entries(getItemClasses(getPoeVersion())).map(([k, v]) => [k, v.size]))
  }
  return _itemSizes
}

/** Add base types extracted from the loaded filter */
export function registerFilterBaseTypes(baseTypes: string[]): void {
  _filterBaseTypes = new Set(baseTypes)
}

export function clearFilterBaseTypes(): void {
  _filterBaseTypes = new Set()
}

export function __hasKnownBaseTypeForTest(baseType: string): boolean {
  return getKnownBaseTypes().has(baseType)
}

/** Try to find a known base type within a magic item name */
function findBaseInName(name: string, candidates: Iterable<string>): string | null {
  const sorted = [...candidates].sort((a, b) => b.length - a.length)
  for (const base of sorted) {
    if (name === base) return base
    const idx = name.indexOf(base)
    if (idx >= 0) {
      const before = name[idx - 1]
      const after = name[idx + base.length]
      if ((!before || before === ' ') && (!after || after === ' ')) return base
    }
  }
  return null
}

/** Strip "Superior" prefix and magic item affixes to get the real base type. */
function cleanBaseType(
  rawBase: string,
  rarity: ItemRarity,
  itemClass?: string,
  affixNames?: { prefix?: string; suffix?: string },
): string {
  // PoE2 prepends "Superior" (quality) or "Exceptional" (extra rune sockets) to
  // a white base's name; neither is part of the actual base type, so peel them off
  // before matching. "Advanced"/"Expert" are NOT stripped -- those are genuinely
  // distinct PoE2 base types.
  const clean = rawBase.replace(/^Superior\s+/i, '').replace(/^Exceptional\s+/i, '')
  if (rarity === 'Magic') {
    // First try bases specific to this item class for the active game (avoids
    // false matches and keeps PoE1/PoE2 base lists from shadowing each other).
    if (itemClass) {
      const classBases = getItemClasses(getPoeVersion())[itemClass]?.bases
      if (classBases?.length) {
        const match = findBaseInName(
          clean,
          classBases.map((b) => b.name),
        )
        if (match) return match
      }
    }
    // Then any base type seen in the loaded filter (covers PoE2 bases the
    // shipped item-classes data doesn't enumerate yet).
    const knownMatch = findBaseInName(clean, getKnownBaseTypes())
    if (knownMatch) return knownMatch
    // Last resort: peel the affix names parsed from the advanced-mod headers
    // ({ Prefix Modifier "Sanguine" }, { Suffix Modifier "of the Troll" }).
    // This is exact (the names come from the clipboard, not a regex guess),
    // so it works for any base even if our static base list is missing it.
    if (affixNames) {
      let stripped = clean
      if (affixNames.prefix) {
        const re = new RegExp(`^${escapeRegex(affixNames.prefix)}\\s+`, 'i')
        stripped = stripped.replace(re, '')
      }
      if (affixNames.suffix) {
        const re = new RegExp(`\\s+${escapeRegex(affixNames.suffix)}$`, 'i')
        stripped = stripped.replace(re, '')
      }
      if (stripped !== clean) return stripped
    }
    return clean
  }
  return clean
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// PoE2's advanced clipboard format tags enchantments under { Enhancement }
// headers and corruption implicits under { Corruption Enhancement } headers
// (optionally followed by a tag), instead of the (enchant) line suffix the
// rest of the parser keys off. The trade API stores both under the enchant.*
// stat family, so the stat lines beneath these headers belong in enchants[].
const ENHANCEMENT_HEADER = /^\{\s*(?:Corruption\s+)?Enhancement\b[^}]*\}$/i

/** Strip advanced-mod roll-range notation ("41(39-42)%" -> "41%"), variant
 *  alternatives ("Bladefall(Fireball-Divine Blast)" -> "Bladefall"), and the
 *  trailing "Unscalable Value" suffix from a single advanced-mod stat line. */
function cleanAdvancedModLine(line: string): string {
  return line
    .replace(/(-?\d+(?:\.\d+)?)\(-?\d+(?:\.\d+)?(?:--?\d+(?:\.\d+)?)?\)/g, '$1')
    .replace(/([a-zA-Z]\w*)\s*\([^)]*\)/g, '$1')
    .replace(/\s*[—–-]+\s*Unscalable Value$/i, '')
    .trim()
}

/** Cheap scan for the prefix/suffix names in advanced-mod headers, e.g.
 *   { Prefix Modifier "Sanguine" (Tier: 11) -- Life }
 *   { Suffix Modifier "of the Troll" (Tier: 6) -- Life }
 *  Returns only the FIRST of each so cleanBaseType has something to peel off
 *  the raw "Sanguine Layered Vest of the Troll" when the static base lists
 *  don't recognize the base. Magic items only ever have one prefix and one
 *  suffix so first-match is correct. */
function scanMagicAffixNames(text: string): { prefix?: string; suffix?: string } {
  const result: { prefix?: string; suffix?: string } = {}
  const headerPattern = /^\{\s*(?:[A-Z][a-z]+\s+)?(Prefix|Suffix)\s+Modifier\s*"([^"]+)"/
  for (const line of text.split('\n')) {
    const m = line.trim().match(headerPattern)
    if (!m) continue
    const kind = m[1].toLowerCase() as 'prefix' | 'suffix'
    if (!result[kind]) result[kind] = m[2]
    if (result.prefix && result.suffix) break
  }
  return result
}

/**
 * Read the current clipboard and attempt to parse it as a PoE item.
 * Returns null if the clipboard doesn't look like a PoE item.
 */
export function readItemFromClipboard(): PoeItem | null {
  const text = clipboard.readText()
  return parseItemText(text)
}

export function parseItemText(text: string): PoeItem | null {
  if (!text?.includes('--------')) return null

  const sections = text.split('--------').map((s) => s.trim())
  if (sections.length < 2) return null

  // Unusable items (wrong class/level/attributes) wedge a "You cannot use this
  // item. Its stats will be ignored" line between Rarity and the name/base, which
  // bumps the real name/base into the next section. Drop the warning and merge the
  // Class/Rarity header back onto the name/base block so nameplate parsing lines up.
  if (sections.length >= 3 && sections[0].split('\n').some((l) => l.trim().startsWith('You cannot use this item'))) {
    const headerLines = sections[0]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('You cannot use this item'))
    sections[1] = [...headerLines, sections[1]].join('\n')
    sections.shift()
  }

  // Section 0: header — Item Class, Rarity, Name, Base Type
  const headerLines = sections[0]
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const itemClassLine = headerLines.find((l) => l.startsWith('Item Class:'))
  const rarityLine = headerLines.find((l) => l.startsWith('Rarity:'))

  if (!itemClassLine || !rarityLine) return null

  // Normalize variant class names to canonical forms
  const rawItemClass = itemClassLine.replace('Item Class:', '').trim()
  const itemClass = rawItemClass === 'DivinationCard' ? 'Divination Cards' : rawItemClass
  const rarity = rarityLine.replace('Rarity:', '').trim() as ItemRarity

  // Name and base type follow rarity
  const afterRarity = headerLines.slice(headerLines.indexOf(rarityLine) + 1)
  const name = afterRarity[0] ?? ''
  // PoE2 uncut gems inline the gem level in the name: "Uncut Skill Gem (Level 20)".
  // Keep the suffix on `name` (bulk-exchange IDs are per-level, so we need the
  // leveled key to hit the exchange map), but strip it from the derived base
  // type so filter `BaseType` conditions and the sister panel's current-base
  // highlight see the plain "Uncut Skill Gem" the filter lists.
  const nameLevelMatch = name.match(/\s*\(Level (\d+)\)\s*$/)
  const nameGemLevel = nameLevelMatch ? parseInt(nameLevelMatch[1], 10) : 0
  const nameStripped = nameLevelMatch ? name.slice(0, nameLevelMatch.index).trim() : name
  // For Normal/Magic items, name IS the base type; for Rare/Unique, line 2 is base type
  // Unidentified Rare/Unique items only have one line (the base type), no separate name
  const rawBaseType = rarity === 'Rare' || rarity === 'Unique' ? (afterRarity[1] ?? nameStripped) : nameStripped
  // Strip modifier prefixes -- filters treat these as separate conditions, not part of the base type
  // Keep Blighted/Blight-ravaged for maps and incubators since it's part of the actual base type name
  const keepBlight = itemClass === 'Maps' || itemClass === 'Incubators'
  // For magic blueprints/contracts, extract the base type from the name
  // e.g. "Shocking Blueprint: Bunker of Drought" -> "Blueprint: Bunker"
  const HEIST_LOCATIONS = new Set([
    'Bunker',
    'Records Office',
    'Mansion',
    "Smuggler's Den",
    'Underbelly',
    'Laboratory',
    'Prohibited Library',
    'Repository',
    'Tunnels',
  ])
  const heistBaseType = (() => {
    if (rarity !== 'Magic') return undefined
    if (itemClass !== 'Blueprints' && itemClass !== 'Contracts') return undefined
    const keyword = itemClass === 'Blueprints' ? 'Blueprint' : 'Contract'
    for (const loc of HEIST_LOCATIONS) {
      if (rawBaseType.includes(`${keyword}: ${loc}`)) return `${keyword}: ${loc}`
    }
    return keyword
  })()
  // Pull just the prefix/suffix names from the advanced-mod headers so
  // cleanBaseType can fall back to peeling them off the raw name when the
  // static base list doesn't recognize the base. We do a lightweight regex
  // scan instead of running the full parseAdvancedMods up here.
  const magicAffixNames = rarity === 'Magic' ? scanMagicAffixNames(text) : undefined

  const baseType =
    heistBaseType ??
    cleanBaseType(
      rawBaseType
        .replace(/^Synthesised /, '')
        .replace(keepBlight ? /(?:)/ : /^Blighted /i, '')
        .replace(keepBlight ? /(?:)/ : /^Blight-[Rr]avaged /i, ''),
      rarity as ItemRarity,
      itemClass,
      magicAffixNames,
    )

  const isGemClass = SKILL_GEM_CLASSES.has(itemClass)
  const isVaalGem =
    isGemClass &&
    rarity === 'Gem' &&
    !name.startsWith('Vaal ') &&
    sections.some((s) => s.trim().startsWith(`Vaal ${name}`))

  // Collect all text across sections for parsing
  const allText = sections.join('\n')
  const allLines = allText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // Extract map/waystone tier from header line like "Map (Tier 12)" or "Waystone (Tier 5)"
  const tierMatch = name.match(/\(Tier (\d+)\)/) ?? baseType.match(/\(Tier (\d+)\)/)
  // Heist job skill requirement: "Requires Engineering (Level 3)" or "(Level 3 (unmet))"
  const heistJobLine = allLines.find((l) => /^Requires \w+.*\(Level \d+/.test(l))
  const heistJobMatch = heistJobLine?.match(/^Requires (\w[\w -]*?)\s*\(Level (\d+)/)
  const heistJob = heistJobMatch ? { skill: heistJobMatch[1].trim(), level: parseInt(heistJobMatch[2], 10) } : undefined

  // Monster level (maps) or Area Level (heist contracts/blueprints)
  const monsterLevel = extractNum(allLines, 'Monster Level:') ?? extractNum(allLines, 'Area Level:')
  const mapTier = tierMatch ? parseInt(tierMatch[1], 10) : monsterLevel && monsterLevel >= 68 ? monsterLevel - 67 : 0
  const itemLevel = extractNum(allLines, 'Item Level:') ?? 0
  const qualityLine = allLines.find((l) => l.startsWith('Quality'))
  const qualityMatch = qualityLine?.match(/\+(\d+)%/)
  const quality = qualityMatch ? parseInt(qualityMatch[1], 10) : 0
  // Map properties (Item Quantity, Rarity, Pack Size, More X)
  const mapQuantity = extractNum(allLines, 'Item Quantity:')
  const mapRarity = extractNum(allLines, 'Item Rarity:')
  // PoE1 maps label it "Monster Pack Size:", PoE2 waystones just "Pack Size:".
  const mapPackSize = extractNum(allLines, 'Monster Pack Size:') ?? extractNum(allLines, 'Pack Size:')
  // PoE2 waystone-only property lines.
  const mapRevives = extractNum(allLines, 'Revives Available:')
  const mapDropChance = extractNum(allLines, 'Waystone Drop Chance:')
  const mapGold = extractNum(allLines, 'Gold Found:')
  const mapMagicMonsters = extractNum(allLines, 'Magic Monsters:')
  const mapRareMonsters = extractNum(allLines, 'Rare Monsters:')
  const rewardLine = allLines.find((l) => l.startsWith('Reward:'))
  const mapReward = rewardLine
    ? rewardLine
        .replace('Reward:', '')
        .trim()
        .replace(/^Foil\s+/i, '')
    : undefined
  const mapMoreScarabs = extractNum(allLines, 'More Scarabs:')
  const mapMoreCurrency = extractNum(allLines, 'More Currency:')
  const mapMoreMaps = extractNum(allLines, 'More Maps:')
  const mapMoreDivCards = extractNum(allLines, 'More Divination Cards:')

  const memoryStrands = extractNum(allLines, 'Memory Strands:')

  // Heist blueprints: "Wings Revealed: 3/4"
  const wingsLine = allLines.find((l) => l.startsWith('Wings Revealed:'))
  const wingsParts = wingsLine?.split(':')[1]?.trim().split('/')
  const wingsRevealed = wingsParts ? parseInt(wingsParts[0], 10) : undefined
  const wingsTotal = wingsParts?.[1] ? parseInt(wingsParts[1], 10) : undefined
  // Facetor's Lens: "Stored Experience: 999,627,082"
  const storedExpLine = allLines.find((l) => l.startsWith('Stored Experience:'))
  const storedExperience = storedExpLine
    ? parseInt(storedExpLine.split(':')[1].trim().replace(/,/g, ''), 10)
    : undefined

  // `Level:` body line is how PoE1 gems report their level. PoE2 uncut gems
  // don't have it -- their level lives in the name (see nameGemLevel above) --
  // so fall back to that when the body didn't surface one.
  const gemLevel = extractNum(allLines, 'Level:') ?? nameGemLevel
  const stackSizeLine = allLines.find((l) => l.startsWith('Stack Size:'))
  const stackParts = stackSizeLine?.split(':')[1]?.trim().split('/') ?? []
  const stackSize = stackParts[0] ? parseInt(stackParts[0].replace(/,/g, ''), 10) : 1
  const maxStackSize = stackParts[1] ? parseInt(stackParts[1].replace(/,/g, ''), 10) : undefined

  // Requirements
  // Defenses (total computed values from the item header)
  const armour = extractNum(allLines, 'Armour:') ?? 0
  const evasion = extractNum(allLines, 'Evasion Rating:') ?? 0
  const energyShield = extractNum(allLines, 'Energy Shield:') ?? 0
  const ward = extractNum(allLines, 'Runic Ward:') ?? extractNum(allLines, 'Ward:') ?? 0
  const block = extractNum(allLines, 'Chance to Block:') ?? 0

  // Weapon damage. Strip thousands-separator commas first so big rolls like
  // "425-1,148" aren't truncated at the comma. PoE writes ", " (with a space)
  // when listing multiple ele ranges, so the global match below still splits
  // them correctly after the commas are gone.
  const physDamageLine = allLines.find((l) => l.startsWith('Physical Damage:'))?.replace(/,/g, '')
  let physDamageMin: number | undefined
  let physDamageMax: number | undefined
  if (physDamageLine) {
    const m = physDamageLine.match(/(\d+)-(\d+)/)
    if (m) {
      physDamageMin = parseInt(m[1], 10)
      physDamageMax = parseInt(m[2], 10)
    }
  }

  // PoE1 lists a single combined "Elemental Damage:" line with comma-separated
  // per-color ranges; PoE2 lists each color on its own line (e.g.
  // "Lightning Damage: 5-89"). Sum the average of every range across both formats
  // so weapon edps/total dps includes all elemental sources.
  let eleDamageAvg: number | undefined
  const eleDamageLines = allLines.filter(
    (l) =>
      l.startsWith('Elemental Damage:') ||
      l.startsWith('Fire Damage:') ||
      l.startsWith('Cold Damage:') ||
      l.startsWith('Lightning Damage:'),
  )
  for (const line of eleDamageLines) {
    for (const m of line.replace(/,/g, '').matchAll(/(\d+)-(\d+)/g)) {
      eleDamageAvg = (eleDamageAvg ?? 0) + (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2
    }
  }

  const chaosDamageLine = allLines.find((l) => l.startsWith('Chaos Damage:'))?.replace(/,/g, '')
  let chaosDamageAvg: number | undefined
  if (chaosDamageLine) {
    const m = chaosDamageLine.match(/(\d+)-(\d+)/)
    if (m) chaosDamageAvg = (parseInt(m[1], 10) + parseInt(m[2], 10)) / 2
  }

  const attacksPerSecond = extractFloat(allLines, 'Attacks per Second:')
  const critChance = extractFloat(allLines, 'Critical Strike Chance:')

  const reqStr = extractNum(allLines, 'Str:') ?? 0
  const reqDex = extractNum(allLines, 'Dex:') ?? 0
  const reqInt = extractNum(allLines, 'Int:') ?? 0

  // Sockets
  const socketLine = allLines.find((l) => l.startsWith('Sockets:'))
  const sockets = socketLine ? socketLine.replace('Sockets:', '').trim() : ''
  const linkedSockets = computeLinkedSockets(sockets)

  // Flags
  const twiceCorrupted = allLines.some((l) => l === 'Twice Corrupted')
  // A twice-corrupted item is also corrupted. PoE2 emits exactly one of these
  // section lines: "Corrupted" or "Twice Corrupted" (mirrors Exiled Exchange 2).
  const corrupted = twiceCorrupted || allLines.some((l) => l === 'Corrupted')
  // PoE2: a Vaal-corrupted unique mod is annotated "{ Vaal Unique Modifier ... }"
  // (mirrors Exiled Exchange 2; there is no item-level marker). allLines are
  // already trimmed, so anchor on the brace-wrapped annotation.
  const hasVaalUniqueMod = allLines.some((l) => /^\{\s*Vaal\s+Unique\s+Modifier\b[^}]*\}$/.test(l))
  const mirrored = allLines.some((l) => l === 'Mirrored')
  const synthesised =
    allLines.some((l) => l.startsWith('Synthesis') || l.startsWith('Synthesised')) ||
    rawBaseType.startsWith('Synthesised ')
  const fractured = allLines.some((l) => l.includes('(fractured)') || l === 'Fractured Item')
  const uberBlighted = /^Blight-ravaged /i.test(rawBaseType)
  const blighted =
    uberBlighted || allLines.some((l) => l.toLowerCase().includes('blighted map')) || /^Blighted /i.test(rawBaseType)
  const transfigured = isGemClass && allLines.some((l) => l === 'Transfigured')
  const vaalGem = isGemClass && rarity === 'Gem' && allLines.some((l) => l.startsWith('Souls Per Use:'))
  const scourged = allLines.some((l) => l.includes('Scourge'))
  const zanaMemory = allLines.some((l) => l.toLowerCase().includes("originator's memories"))
  const implicitCount = allLines.filter((l) => l.endsWith('(implicit)')).length

  // Identified: unidentified items have an "Unidentified" line. PoE2 unid drops
  // append a tier, e.g. "Unidentified (Tier 4)" -- match both forms and pull the tier.
  const unidLine = allLines.find((l) => l === 'Unidentified' || /^Unidentified \(Tier \d+\)$/.test(l))
  const identified = !unidLine
  const unidTierMatch = unidLine?.match(/\(Tier (\d+)\)/)
  const unidentifiedItemTier = unidTierMatch ? parseInt(unidTierMatch[1], 10) : undefined

  // Influence
  const influence: string[] = []
  const influenceMap: Record<string, string> = {
    'Shaper Item': 'Shaper',
    'Elder Item': 'Elder',
    'Crusader Item': 'Crusader',
    'Redeemer Item': 'Redeemer',
    'Hunter Item': 'Hunter',
    'Warlord Item': 'Warlord',
    'Searing Exarch Item': 'Searing Exarch',
    'Eater of Worlds Item': 'Eater of Worlds',
  }
  for (const [line, inf] of Object.entries(influenceMap)) {
    if (allLines.some((l) => l.startsWith(line))) influence.push(inf)
  }
  // Maps can also indicate influence via implicits like "Map contains Drox's Citadel"
  if (influence.length === 0) {
    const conquerorImplicits: Record<string, string> = {
      drox: 'Warlord',
      veritania: 'Redeemer',
      'al-hezmin': 'Hunter',
      baran: 'Crusader',
    }
    for (const [name, inf] of Object.entries(conquerorImplicits)) {
      if (allLines.some((l) => l.toLowerCase().includes(name))) influence.push(inf)
    }
    if (allLines.some((l) => l.toLowerCase().includes('influenced by the shaper'))) influence.push('Shaper')
    if (allLines.some((l) => l.toLowerCase().includes('influenced by the elder'))) influence.push('Elder')
  }

  // Mods — parse from the "requirements" section onwards
  // Explicits are in the last stat section before "Corrupted"/"Note"/flavour
  const explicits: string[] = []
  const implicits: string[] = []
  const enchants: string[] = []
  parseModSections(sections, explicits, implicits, itemClass)

  // Parse logbook factions and bosses from section text
  const logbookFactions: string[] = []
  const logbookBosses: string[] = []
  if (itemClass === 'Expedition Logbooks') {
    const factionNames: Record<string, string> = {
      'Knights of the Sun': 'knights',
      'Black Scythe Mercenaries': 'mercenaries',
      'Order of the Chalice': 'order',
      'Druids of the Broken Circle': 'druids',
    }
    for (const section of sections) {
      const lines = section
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      for (const line of lines) {
        if (factionNames[line]) logbookFactions.push(factionNames[line])
        const bossMatch = line.match(/^Area contains (.+) \(implicit\)$/)
        if (bossMatch && !bossMatch[1].match(/^\d/)) logbookBosses.push(bossMatch[1])
      }
    }
  }

  // Parse Inscribed Ultimatum lines (Challenge / Reward / Requires Sacrifice).
  // Lives in the metadata section the in-game tooltip puts above the modifier
  // block. We capture as raw text; the trade-side stat-matcher resolves the
  // human-readable label to the internal API id.
  let ultimatumChallenge: string | undefined
  let ultimatumRewardText: string | undefined
  let ultimatumRequired: string | undefined
  if (baseType === 'Inscribed Ultimatum') {
    for (const section of sections) {
      for (const line of section.split('\n').map((l) => l.trim())) {
        const ch = line.match(/^Challenge:\s*(.+)$/)
        if (ch) ultimatumChallenge = ch[1].trim()
        const rw = line.match(/^Reward:\s*(.+)$/)
        if (rw) ultimatumRewardText = rw[1].trim()
        const rs = line.match(/^Requires Sacrifice:\s*(.+?)(?:\s*x\d+)?$/)
        if (rs) ultimatumRequired = rs[1].trim()
      }
    }
  }

  // Parse Chronicle of Atzoatl rooms
  const atzoatlOpenRooms: string[] = []
  const atzoatlObstructedRooms: string[] = []
  if (baseType === 'Chronicle of Atzoatl') {
    for (const section of sections) {
      const lines = section
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (lines[0] !== 'Open Rooms:') continue
      let target = atzoatlOpenRooms
      for (let li = 1; li < lines.length; li++) {
        const line = lines[li]
        if (line === 'Obstructed Rooms:') {
          target = atzoatlObstructedRooms
          continue
        }
        const m = line.match(/^(.+?)\s*(?:\(Tier \d+\))?$/)
        if (m) target.push(m[1].trim())
      }
    }
  }

  // Parse Grants Skill lines (PoE2 uniques/rune-corrupted items).
  // Scan every section for lines matching "Grants Skill: Level N <SkillName>".
  // Multiple granted skills on one item are all captured.
  const grantedSkills: string[] = []
  const GRANTS_SKILL_RE = /^Grants Skill: Level \d+ /
  for (const section of sections) {
    for (const line of section.split('\n').map((l) => l.trim())) {
      if (GRANTS_SKILL_RE.test(line)) grantedSkills.push(line)
    }
  }

  // Parse enchant and imbue lines
  const imbues: string[] = []
  for (const section of sections) {
    let inEnhancement = false
    for (const line of section.split('\n').map((l) => l.trim())) {
      if (!line) continue
      // Advanced-mod headers set the context for the stat lines beneath them.
      // A { Enhancement } / { Corruption Enhancement } header means the lines
      // that follow are enchants; any other header (or a non-header line) ends
      // that context so unrelated mods aren't swept in.
      if (line.startsWith('{')) {
        inEnhancement = ENHANCEMENT_HEADER.test(line)
        continue
      }
      if (line.endsWith('(enchant)') && !line.startsWith('(')) {
        enchants.push(line.replace(/\s*\(enchant\)$/, '').trim())
        continue
      }
      if (inEnhancement && !line.startsWith('(')) {
        enchants.push(cleanAdvancedModLine(line))
        continue
      }
      if (line.startsWith('Supported by Level')) {
        imbues.push(line)
      }
    }
  }

  // Parse advanced mod data if available (Ctrl+Alt+C format)
  const advancedMods = parseAdvancedMods(text)

  // If advanced mods are available, rebuild implicits and explicits from them
  // since the advanced format doesn't use "(implicit)" suffixes
  if (advancedMods.length > 0) {
    implicits.length = 0
    explicits.length = 0
    for (const am of advancedMods) {
      const stripped = am.lines
        .filter((l) => !l.startsWith('(')) // Skip parenthetical descriptions
        .map(cleanAdvancedModLine)
        .filter(Boolean)
      // For multi-line mods: push both the joined version (for genuine multi-line stats like
      // "Passives granting Fire Resistance...\nalso grant increased Maximum Life...") AND
      // individual lines (for hybrid mods that have two independent stats under one affix header).
      // The stat matcher picks the best match by text length, so the right one wins.
      if (am.type === 'implicit') {
        for (const line of stripped) implicits.push(line)
        if (stripped.length > 1) implicits.push(stripped.join('\n'))
      } else {
        for (const line of stripped) explicits.push(line)
        if (stripped.length > 1) explicits.push(stripped.join('\n'))
      }
    }
  }

  const itemSize = getItemSizes()[itemClass]

  return {
    itemClass,
    rarity,
    name: isVaalGem ? `Vaal ${name}` : name,
    baseType: isVaalGem ? `Vaal ${baseType}` : baseType,
    mapTier,
    itemLevel,
    quality,
    sockets,
    linkedSockets,
    armour,
    evasion,
    energyShield,
    ward,
    block,
    reqStr,
    reqDex,
    reqInt,
    corrupted,
    twiceCorrupted,
    hasVaalUniqueMod,
    identified,
    ...(unidentifiedItemTier != null ? { unidentifiedItemTier } : {}),
    mirrored,
    synthesised,
    fractured,
    transfigured,
    ...(vaalGem ? { vaalGem: true } : {}),
    blighted,
    uberBlighted,
    scourged,
    zanaMemory,
    implicitCount,
    gemLevel,
    stackSize,
    maxStackSize,
    influence,
    explicits,
    implicits,
    enchants,
    imbues,
    ...(grantedSkills.length > 0 ? { grantedSkills } : {}),
    ...(memoryStrands != null ? { memoryStrands } : {}),
    ...(advancedMods.length > 0 ? { advancedMods } : {}),
    ...(mapQuantity != null ? { mapQuantity } : {}),
    ...(mapRarity != null ? { mapRarity } : {}),
    ...(mapPackSize != null ? { mapPackSize } : {}),
    ...(mapReward != null ? { mapReward } : {}),
    ...(mapMoreScarabs != null ? { mapMoreScarabs } : {}),
    ...(mapMoreCurrency != null ? { mapMoreCurrency } : {}),
    ...(mapMoreMaps != null ? { mapMoreMaps } : {}),
    ...(mapMoreDivCards != null ? { mapMoreDivCards } : {}),
    ...(mapRevives != null ? { mapRevives } : {}),
    ...(mapDropChance != null ? { mapDropChance } : {}),
    ...(mapGold != null ? { mapGold } : {}),
    ...(mapMagicMonsters != null ? { mapMagicMonsters } : {}),
    ...(mapRareMonsters != null ? { mapRareMonsters } : {}),
    ...(physDamageMin != null ? { physDamageMin, physDamageMax } : {}),
    ...(eleDamageAvg != null ? { eleDamageAvg } : {}),
    ...(chaosDamageAvg != null ? { chaosDamageAvg } : {}),
    ...(attacksPerSecond != null ? { attacksPerSecond } : {}),
    ...(critChance != null ? { critChance } : {}),
    ...(itemSize ? { width: itemSize[0], height: itemSize[1] } : {}),
    ...(heistJob ? { heistJob } : {}),
    ...(monsterLevel != null ? { monsterLevel } : {}),
    ...(wingsRevealed != null ? { wingsRevealed, wingsTotal } : {}),
    ...(storedExperience != null ? { storedExperience } : {}),
    ...(logbookFactions.length > 0 ? { logbookFactions } : {}),
    ...(logbookBosses.length > 0 ? { logbookBosses } : {}),
    ...(atzoatlOpenRooms.length > 0 || atzoatlObstructedRooms.length > 0
      ? { atzoatlRooms: [...atzoatlOpenRooms, ...atzoatlObstructedRooms], atzoatlOpenCount: atzoatlOpenRooms.length }
      : {}),
    ...(ultimatumChallenge != null ? { ultimatumChallenge } : {}),
    ...(ultimatumRewardText != null ? { ultimatumRewardText } : {}),
    ...(ultimatumRequired != null ? { ultimatumRequired } : {}),
    // Default areaLevel to the higher of itemLevel and the endgame baseline.
    // Currency (no itemLevel) and low-itemLevel gear inspected outside a known
    // endgame zone both fall back to endgame so AreaLevel-gated leveling rules
    // don't win. Genuine endgame drops (itemLevel above the baseline, e.g. T17
    // / Wraeclast bosses in PoE1) keep their actual itemLevel. The zone override
    // in evaluation.ts corrects this in-zone.
    areaLevel: Math.max(itemLevel, endgameAreaLevel(getPoeVersion())),
  }
}

function extractNum(lines: string[], prefix: string): number | null {
  const line = lines.find((l) => l.startsWith(prefix))
  if (!line) return null
  const match = line.replace(prefix, '').match(/\d+/)
  return match ? parseInt(match[0], 10) : null
}

/** Like `extractNum` but keeps decimal precision -- for lines like "Attacks per
 *  Second: 1.45" or "Critical Strike Chance: 6.30%". */
function extractFloat(lines: string[], prefix: string): number | undefined {
  const line = lines.find((l) => l.startsWith(prefix))
  if (!line) return undefined
  const match = line.match(/(\d+(?:\.\d+)?)/)
  return match ? parseFloat(match[1]) : undefined
}

function computeLinkedSockets(sockets: string): number {
  if (!sockets) return 0
  const groups = sockets.split(' ')
  return Math.max(...groups.map((g) => g.split('-').length))
}

/**
 * Rough heuristic: explicit mods appear in the last substantive section
 * before cosmetic/corruption lines. Implicit mods appear right after sockets/requirements.
 */
function parseModSections(sections: string[], explicits: string[], implicits: string[], itemClass?: string): void {
  // Charms expose their rollable affixes as bare-integer lines ("Recover 17 Mana
  // when Used") with no % or sign, which the generic mod heuristic treats as
  // flavour and drops. The charm-only branches below recognize those lines and
  // skip the charm's intrinsic state block so it isn't mistaken for affixes.
  const isCharm = itemClass === 'Charms'
  const skipPrefixes = [
    'Item Class:',
    'Rarity:',
    'Sockets:',
    'Item Level:',
    'Quality:',
    'Requirements:',
    'Level:',
    'Str:',
    'Dex:',
    'Int:',
    'Note:',
    'Evasion Rating:',
    'Armour:',
    'Energy Shield:',
    'Ward:',
    'Runic Ward:',
    'Stack Size:',
    'Corrupted',
    'Unidentified',
    'Mirrored',
    'Synthesised',
    'Right click',
    'Shift click',
    'Place into',
    'Can be used',
    'Physical Damage:',
    'Elemental Damage:',
    'Critical Strike Chance:',
    'Attacks per Second:',
    'Weapon Range:',
    'Map Area:',
    'Monster Level:',
    'Reward:',
    'One Handed',
    'Two Handed',
    'Bow',
    'Staff',
    'Wand',
    'Talisman Tier:',
    'Map Tier:',
    'Cost & Reservation',
  ]

  // A charm's intrinsic block ("Lasts 3 Seconds", "Consumes 30 of 40 Charges on
  // use", "Currently has 40 Charges", "Grants Immunity to Ignite") is runtime
  // state / base effect, never a rollable affix -- exclude it so it can't be
  // picked as the explicit section.
  if (isCharm) skipPrefixes.push('Lasts ', 'Consumes ', 'Currently has ', 'Grants Immunity')

  const skipSuffixes = ['--------']

  const isModLine = (line: string): boolean =>
    line.length > 0 &&
    !skipPrefixes.some((p) => line.startsWith(p)) &&
    !skipSuffixes.some((s) => line === s) &&
    !line.match(/^\d+$/) &&
    !line.startsWith('{') // Skip advanced mod headers like { Prefix Modifier "..." }

  // First pass: any line ending with (implicit) goes to implicits
  for (const section of sections) {
    const lines = section
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    for (const line of lines) {
      if (line.endsWith('(implicit)')) {
        implicits.push(line.replace(/(\d+(?:\.\d+)?)\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)/g, '$1'))
      }
    }
  }

  // Find explicit section: scan sections for mod-like content
  // Skip sections that are purely: header, defenses, requirements, sockets, ilvl, implicits, flavour, corrupted
  const isImplicitSection = (s: string): boolean => s.split('\n').some((l) => l.trim().endsWith('(implicit)'))
  const isFlavourOrMeta = (s: string): boolean => {
    const lines = s
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    // Flavour text sections have no mod-like patterns (no numbers with +/%).
    // Charm affixes can be bare integers ("Recover 17 Mana when Used"), so for
    // charms any digit counts as a mod pattern.
    return lines.every(
      (l) => !l.match(/[+-]\d|^\d+%|\d+(?:\.\d+)?%/) && !l.endsWith('(crafted)') && !(isCharm && /\d/.test(l)),
    )
  }

  const modSections = sections.filter((s) => {
    const lines = s
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (!lines.some(isModLine)) return false
    if (isImplicitSection(s)) return false
    // Skip single-word/short sections that are likely flavour or labels
    if (
      lines.length === 1 &&
      lines[0].length < 20 &&
      !lines[0].match(/[+-]\d|^\d+%/) &&
      !(isCharm && /\d/.test(lines[0]))
    )
      return false
    return true
  })

  // The last mod section that contains actual mod patterns is the explicit section
  // Note: if advanced mods are parsed, explicits come from there instead
  // Work backwards, skip flavour text
  for (let i = modSections.length - 1; i >= 0; i--) {
    const lines = modSections[i]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .filter(isModLine)
    const hasRealMods = lines.some(
      (l) =>
        l.match(/[+-]\d|^\d+%|\d+(?:\.\d+)?%/) ||
        l.endsWith('(crafted)') ||
        l.startsWith('Adds ') ||
        // Signless whole-number mods that the sign/percent patterns miss, e.g.
        // Voices' "Allocates 2 Sinister Jewel sockets" -- without this the
        // backward scan treats the section as flavour and drops the explicit.
        l.startsWith('Allocates ') ||
        (isCharm && /\d/.test(l)),
    )
    if (hasRealMods || !isFlavourOrMeta(modSections[i])) {
      lines
        .filter((l) => !l.endsWith('(implicit)'))
        .forEach((l) => {
          // Strip advanced roll range notation: "41(39-42)%" -> "41%"
          explicits.push(l.replace(/(\d+(?:\.\d+)?)\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)/g, '$1'))
        })
      break
    }
  }
}

/**
 * Parse advanced mod info from Ctrl+Alt+C clipboard format.
 * Looks for lines like: { Prefix Modifier "Hummingbird's" (Tier: 1) -- Defences, Evasion }
 * followed by mod text lines like: 41(39-42)% increased Evasion and Energy Shield
 */
function parseAdvancedMods(text: string): AdvancedMod[] {
  const mods: AdvancedMod[] = []
  const lines = text.split('\n').map((l) => l.trim())

  // Match: { [Qualifier ]Prefix/Suffix/Implicit/Unique Modifier "Name" (Tier: N) -- Tags }
  // Name and Tier are optional (implicits and uniques may omit them).
  // Eldritch mods use named tiers like (Exquisite), (Grand) instead of (Tier: N).
  // The leading qualifier (Fractured/Desecrated/Master Crafted/Searing Exarch/...) is
  // matched generically as "any words before the Prefix/Suffix/... keyword" so a new
  // GGG-added qualifier still registers as a header and doesn't merge into the prior mod
  // (issue: Desecrated mods absorbed the next affix). Specific qualifiers that drive flags
  // (fractured, master crafted, eldritch, foulborn) are still keyed off the captured text.
  const headerPattern =
    /^\{\s*((?:[A-Za-z]+\s+)*?)(Prefix|Suffix|Implicit|Unique)\s+Modifier\s*(?:"([^"]*)")?\s*(?:\((?:(?:Tier|Rank):\s*(\d+)|[A-Za-z]+)\))?\s*(?:[—-]+\s*(.+))?\s*\}$/

  let currentMod: AdvancedMod | null = null

  for (const line of lines) {
    const match = line.match(headerPattern)
    if (match) {
      if (currentMod) mods.push(currentMod)
      const modPrefix = match[1].trim().toLowerCase() // e.g. "fractured", "master crafted" (PoE1) / "crafted" (PoE2), ""
      const modType = match[2].toLowerCase() // e.g. "prefix", "suffix", "implicit", "unique"
      const isFractured = modPrefix === 'fractured'
      const isCrafted = modPrefix === 'master crafted' || modPrefix === 'crafted'
      const isEldritch = modPrefix === 'searing exarch' || modPrefix === 'eater of worlds'
      const isFoulborn = modPrefix === 'foulborn'
      const rawTags = match[5] ?? ''
      // Parse magnitude multiplier from tag suffix like "— 25% Increased" or "— 8% Increased"
      const multMatch = rawTags.match(/(\d+)%\s+Increased\s*$/)
      const magnitudeMultiplier = multMatch ? 1 + parseInt(multMatch[1], 10) / 100 : undefined
      currentMod = {
        type: (modType === 'unique' ? 'prefix' : modType) as 'prefix' | 'suffix' | 'implicit',
        name: match[3] ?? '',
        tier: match[4] ? parseInt(match[4], 10) : 0,
        tags: rawTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        lines: [],
        ranges: [],
        fractured: isFractured,
        crafted: isCrafted,
        eldritch: isEldritch,
        foulborn: isFoulborn,
        magnitudeMultiplier,
      }
      continue
    }

    // Section separator ends the current mod block (prevents flavour text/notes leaking in)
    if (line === '--------') {
      if (currentMod) {
        mods.push(currentMod)
        currentMod = null
      }
      continue
    }

    // If we're inside a mod block, parse the mod text lines (skip parenthetical descriptions)
    if (currentMod && line && !line.startsWith('{') && !line.startsWith('(')) {
      currentMod.lines.push(line)

      // Forbidden Shako-style rolling supports: when a "Socketed Gems are Supported by"
      // line carries the "Unscalable Value" suffix, the trade API stores it under the
      // explicit.indexable_support_* family rather than the regular explicit.stat_*
      // family. Both share identical display text in the stat dictionary, so without
      // this signal the matcher coin-flips between them.
      if (/^Socketed Gems are Supported by Level/i.test(line) && /\bUnscalable Value\b/i.test(line)) {
        currentMod.randomSupport = true
      }

      // Parse roll ranges: "41(39-42)%", "+140(130-144)", "-18(-20--10)%", or the
      // single-value form a corruption-overrolled fixed mod uses ("85(75)%" -- the
      // value exceeds the listed base). The "-max" half is optional; when absent the
      // base is a single value, so min === max (issue #378).
      const rangeMatches = line.matchAll(/(-?\d+(?:\.\d+)?)\((-?\d+(?:\.\d+)?)(?:-(-?\d+(?:\.\d+)?))?\)/g)
      for (const rm of rangeMatches) {
        const min = parseFloat(rm[2])
        currentMod.ranges.push({
          value: parseFloat(rm[1]),
          min,
          max: rm[3] !== undefined ? parseFloat(rm[3]) : min,
        })
      }
    }
  }

  if (currentMod) mods.push(currentMod)
  return mods
}
