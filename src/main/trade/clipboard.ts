import { clipboard } from 'electron'
import type { PoeItem, ItemRarity, AdvancedMod } from '../../shared/types'
import itemClassesData from '../../shared/data/items/item-classes.json'

const itemClasses = itemClassesData as unknown as Record<string, { bases: string[]; size: [number, number] }>
const knownBaseTypes = new Set(Object.values(itemClasses).flatMap((c) => c.bases))
const ITEM_SIZES: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(itemClasses).map(([k, v]) => [k, v.size]),
)

/** Add base types extracted from the loaded filter */
export function registerFilterBaseTypes(baseTypes: string[]): void {
  for (const bt of baseTypes) knownBaseTypes.add(bt)
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

/** Strip "Superior" prefix and magic item affixes to get the real base type */
function cleanBaseType(rawBase: string, rarity: ItemRarity, itemClass?: string): string {
  const clean = rawBase.replace(/^Superior\s+/i, '')
  if (rarity === 'Magic') {
    // First try bases specific to this item class (avoids false matches)
    if (itemClass) {
      const classBases = itemClasses[itemClass]?.bases
      if (classBases?.length) {
        const match = findBaseInName(clean, classBases)
        if (match) return match
      }
    }
    // Fall back to all known base types
    return findBaseInName(clean, knownBaseTypes) ?? clean
  }
  return clean
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
  if (!text || !text.includes('--------')) return null

  const sections = text.split('--------').map((s) => s.trim())
  if (sections.length < 2) return null

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
  // For Normal/Magic items, name IS the base type; for Rare/Unique, line 2 is base type
  // Unidentified Rare/Unique items only have one line (the base type), no separate name
  const rawBaseType = rarity === 'Rare' || rarity === 'Unique' ? (afterRarity[1] ?? name) : name
  // Strip modifier prefixes -- filters treat these as separate conditions, not part of the base type
  // Keep Blighted/Blight-ravaged for maps and incubators since it's part of the actual base type name
  const keepBlight = itemClass === 'Maps' || itemClass === 'Incubators'
  // Some item classes have a single canonical base type -- use it directly
  // instead of trying to parse it from the magic name
  const CLASS_TO_BASE: Record<string, string> = {
    Blueprints: 'Blueprint',
    Contracts: 'Contract',
  }
  const baseType =
    CLASS_TO_BASE[itemClass] ??
    cleanBaseType(
      rawBaseType
        .replace(/^Synthesised /, '')
        .replace(keepBlight ? /(?:)/ : /^Blighted /i, '')
        .replace(keepBlight ? /(?:)/ : /^Blight-[Rr]avaged /i, ''),
      rarity as ItemRarity,
      itemClass,
    )

  // Detect Vaal gems: the gem tags line contains "Vaal" and a section starts with "Vaal <name>"
  const isGemClass = ['Gems', 'Support Gems', 'Skill Gems', 'Active Skill Gems', 'Support Skill Gems'].includes(
    itemClass,
  )
  const gemTagsLine = sections[1]?.split('\n')[0]?.trim() ?? ''
  const isVaalGem =
    isGemClass &&
    rarity === 'Gem' &&
    (gemTagsLine.includes('Vaal') || sections.some((s) => s.trim().startsWith(`Vaal ${name}`)))

  // Collect all text across sections for parsing
  const allText = sections.join('\n')
  const allLines = allText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  // Extract map/waystone tier from header line like "Map (Tier 12)" or "Waystone (Tier 5)"
  const tierMatch = name.match(/\(Tier (\d+)\)/) ?? baseType.match(/\(Tier (\d+)\)/)
  // Monster level (maps) or Area Level (heist contracts/blueprints)
  const monsterLevel = extractNum(allLines, 'Monster Level:') ?? extractNum(allLines, 'Area Level:')
  const mapTier = tierMatch ? parseInt(tierMatch[1]) : monsterLevel && monsterLevel >= 68 ? monsterLevel - 67 : 0
  const itemLevel = extractNum(allLines, 'Item Level:') ?? 0
  const qualityLine = allLines.find((l) => l.startsWith('Quality'))
  const qualityMatch = qualityLine?.match(/\+(\d+)%/)
  const quality = qualityMatch ? parseInt(qualityMatch[1]) : 0
  // Map properties (Item Quantity, Rarity, Pack Size, More X)
  const mapQuantity = extractNum(allLines, 'Item Quantity:')
  const mapRarity = extractNum(allLines, 'Item Rarity:')
  const mapPackSize = extractNum(allLines, 'Monster Pack Size:')
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
  const wingsRevealed = wingsParts ? parseInt(wingsParts[0]) : undefined
  const wingsTotal = wingsParts && wingsParts[1] ? parseInt(wingsParts[1]) : undefined
  // Facetor's Lens: "Stored Experience: 999,627,082"
  const storedExpLine = allLines.find((l) => l.startsWith('Stored Experience:'))
  const storedExperience = storedExpLine ? parseInt(storedExpLine.split(':')[1].trim().replace(/,/g, '')) : undefined

  const gemLevel = extractNum(allLines, 'Level:') ?? 0
  const stackSizeLine = allLines.find((l) => l.startsWith('Stack Size:'))
  const stackSize = stackSizeLine ? parseInt(stackSizeLine.split(':')[1].trim().split('/')[0]) : 1

  // Requirements
  // Defenses (total computed values from the item header)
  const armour = extractNum(allLines, 'Armour:') ?? 0
  const evasion = extractNum(allLines, 'Evasion Rating:') ?? 0
  const energyShield = extractNum(allLines, 'Energy Shield:') ?? 0
  const ward = extractNum(allLines, 'Ward:') ?? 0
  const block = extractNum(allLines, 'Chance to Block:') ?? 0

  // Weapon damage
  const physDamageLine = allLines.find((l) => l.startsWith('Physical Damage:'))
  let physDamageMin: number | undefined
  let physDamageMax: number | undefined
  if (physDamageLine) {
    const m = physDamageLine.match(/(\d+)-(\d+)/)
    if (m) {
      physDamageMin = parseInt(m[1])
      physDamageMax = parseInt(m[2])
    }
  }

  // Elemental damage: may have multiple ranges separated by commas
  const eleDamageLine = allLines.find((l) => l.startsWith('Elemental Damage:'))
  let eleDamageAvg: number | undefined
  if (eleDamageLine) {
    const ranges = [...eleDamageLine.matchAll(/(\d+)-(\d+)/g)]
    if (ranges.length > 0) {
      eleDamageAvg = ranges.reduce((sum, m) => sum + (parseInt(m[1]) + parseInt(m[2])) / 2, 0)
    }
  }

  // Chaos damage
  const chaosDamageLine = allLines.find((l) => l.startsWith('Chaos Damage:'))
  let chaosDamageAvg: number | undefined
  if (chaosDamageLine) {
    const m = chaosDamageLine.match(/(\d+)-(\d+)/)
    if (m) chaosDamageAvg = (parseInt(m[1]) + parseInt(m[2])) / 2
  }

  // Attacks per second
  const apsLine = allLines.find((l) => l.startsWith('Attacks per Second:'))
  let attacksPerSecond: number | undefined
  if (apsLine) {
    const m = apsLine.match(/(\d+(?:\.\d+)?)/)
    if (m) attacksPerSecond = parseFloat(m[1])
  }

  const reqStr = extractNum(allLines, 'Str:') ?? 0
  const reqDex = extractNum(allLines, 'Dex:') ?? 0
  const reqInt = extractNum(allLines, 'Int:') ?? 0

  // Sockets
  const socketLine = allLines.find((l) => l.startsWith('Sockets:'))
  const sockets = socketLine ? socketLine.replace('Sockets:', '').trim() : ''
  const linkedSockets = computeLinkedSockets(sockets)

  // Flags
  const corrupted = allLines.some((l) => l === 'Corrupted')
  const mirrored = allLines.some((l) => l === 'Mirrored')
  const synthesised =
    allLines.some((l) => l.startsWith('Synthesis') || l.startsWith('Synthesised')) ||
    rawBaseType.startsWith('Synthesised ')
  const fractured = allLines.some((l) => l.includes('(fractured)') || l === 'Fractured Item')
  const uberBlighted = /^Blight-ravaged /i.test(rawBaseType)
  const blighted =
    uberBlighted || allLines.some((l) => l.toLowerCase().includes('blighted map')) || /^Blighted /i.test(rawBaseType)
  const transfigured = isGemClass && allLines.some((l) => l === 'Transfigured')
  const scourged = allLines.some((l) => l.includes('Scourge'))
  const zanaMemory = allLines.some((l) => l.toLowerCase().includes("originator's memories"))
  const implicitCount = allLines.filter((l) => l.endsWith('(implicit)')).length

  // Identified: unidentified items have "Unidentified" line
  const identified = !allLines.some((l) => l === 'Unidentified')

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
  parseModSections(sections, explicits, implicits)

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

  // Parse enchant and imbue lines
  const imbues: string[] = []
  for (const section of sections) {
    for (const line of section.split('\n').map((l) => l.trim())) {
      if (line.endsWith('(enchant)') && !line.startsWith('(')) {
        enchants.push(line.replace(/\s*\(enchant\)$/, '').trim())
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
        .map((l) =>
          l
            .replace(/(-?\d+(?:\.\d+)?)\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)/g, '$1') // Strip roll ranges (handles negatives)
            .replace(/([a-zA-Z]\w*)\s*\([^)]*\)/g, '$1') // Strip variant alternatives e.g. Bladefall(Fireball-Divine Blast) -> Bladefall, Ghost Reaver() -> Ghost Reaver
            .replace(/\s*[\u2014\u2013\-]+\s*Unscalable Value$/i, '') // Strip "— Unscalable Value" suffix
            .trim(),
        )
        .filter(Boolean)
      // For multi-line mods: push both the joined version (for genuine multi-line stats like
      // "Passives granting Fire Resistance...\nalso grant increased Maximum Life...") AND
      // individual lines (for hybrid mods that have two independent stats under one affix header).
      // The stat matcher picks the best match by text length, so the right one wins.
      if (am.type === 'implicit') {
        stripped.forEach((l) => implicits.push(l))
        if (stripped.length > 1) implicits.push(stripped.join('\n'))
      } else {
        stripped.forEach((l) => explicits.push(l))
        if (stripped.length > 1) explicits.push(stripped.join('\n'))
      }
    }
  }

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
    identified,
    mirrored,
    synthesised,
    fractured,
    transfigured,
    blighted,
    uberBlighted,
    scourged,
    zanaMemory,
    implicitCount,
    gemLevel,
    stackSize,
    influence,
    explicits,
    implicits,
    enchants,
    imbues,
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
    ...(physDamageMin != null ? { physDamageMin, physDamageMax } : {}),
    ...(eleDamageAvg != null ? { eleDamageAvg } : {}),
    ...(chaosDamageAvg != null ? { chaosDamageAvg } : {}),
    ...(attacksPerSecond != null ? { attacksPerSecond } : {}),
    ...(ITEM_SIZES[itemClass] ? { width: ITEM_SIZES[itemClass][0], height: ITEM_SIZES[itemClass][1] } : {}),
    ...(monsterLevel != null ? { monsterLevel } : {}),
    ...(wingsRevealed != null ? { wingsRevealed, wingsTotal } : {}),
    ...(storedExperience != null ? { storedExperience } : {}),
    ...(logbookFactions.length > 0 ? { logbookFactions } : {}),
    ...(logbookBosses.length > 0 ? { logbookBosses } : {}),
    ...(atzoatlOpenRooms.length > 0 || atzoatlObstructedRooms.length > 0
      ? { atzoatlRooms: [...atzoatlOpenRooms, ...atzoatlObstructedRooms], atzoatlOpenCount: atzoatlOpenRooms.length }
      : {}),
    // Default areaLevel to itemLevel - we don't know the actual zone but this prevents
    // leveling blocks (AreaLevel <= 16) from matching endgame items viewed in stash/town
    areaLevel: itemLevel > 0 ? itemLevel : undefined,
  }
}

function extractNum(lines: string[], prefix: string): number | null {
  const line = lines.find((l) => l.startsWith(prefix))
  if (!line) return null
  const match = line.replace(prefix, '').match(/\d+/)
  return match ? parseInt(match[0]) : null
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
function parseModSections(sections: string[], explicits: string[], implicits: string[]): void {
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
    // Flavour text sections have no mod-like patterns (no numbers with +/%)
    return lines.every((l) => !l.match(/[+\-]\d|^\d+%|\d+(?:\.\d+)?%/) && !l.endsWith('(crafted)'))
  }

  const modSections = sections.filter((s) => {
    const lines = s
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (!lines.some(isModLine)) return false
    if (isImplicitSection(s)) return false
    // Skip single-word/short sections that are likely flavour or labels
    if (lines.length === 1 && lines[0].length < 20 && !lines[0].match(/[+\-]\d|^\d+%/)) return false
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
      (l) => l.match(/[+\-]\d|^\d+%|\d+(?:\.\d+)?%/) || l.endsWith('(crafted)') || l.startsWith('Adds '),
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

  // Match: { Prefix/Suffix/Implicit/Unique Modifier "Name" (Tier: N) -- Tags }
  // Name and Tier are optional (implicits and uniques may omit them)
  // Eldritch mods use named tiers like (Exquisite), (Grand) instead of (Tier: N)
  const headerPattern =
    /^\{\s*((?:(?:Foulborn|Corruption|Enchant|Scourge|Fractured|Master Crafted|Searing Exarch|Eater of Worlds)\s+)?)(Prefix|Suffix|Implicit|Unique)\s+Modifier\s*(?:"([^"]*)")?\s*(?:\((?:(?:Tier|Rank):\s*(\d+)|[A-Za-z]+)\))?\s*(?:[—\-]+\s*(.+))?\s*\}$/

  let currentMod: AdvancedMod | null = null

  for (const line of lines) {
    const match = line.match(headerPattern)
    if (match) {
      if (currentMod) mods.push(currentMod)
      const modPrefix = match[1].trim().toLowerCase() // e.g. "fractured", "master crafted", ""
      const modType = match[2].toLowerCase() // e.g. "prefix", "suffix", "implicit", "unique"
      const isFractured = modPrefix === 'fractured'
      const isCrafted = modPrefix === 'master crafted'
      const isEldritch = modPrefix === 'searing exarch' || modPrefix === 'eater of worlds'
      const isFoulborn = modPrefix === 'foulborn'
      const rawTags = match[5] ?? ''
      // Parse magnitude multiplier from tag suffix like "— 25% Increased" or "— 8% Increased"
      const multMatch = rawTags.match(/(\d+)%\s+Increased\s*$/)
      const magnitudeMultiplier = multMatch ? 1 + parseInt(multMatch[1]) / 100 : undefined
      currentMod = {
        type: (modType === 'unique' ? 'prefix' : modType) as 'prefix' | 'suffix' | 'implicit',
        name: match[3] ?? '',
        tier: match[4] ? parseInt(match[4]) : 0,
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

      // Parse roll ranges: "41(39-42)%" or "+140(130-144)" or "-18(-20--10)%"
      const rangeMatches = line.matchAll(/(-?\d+(?:\.\d+)?)\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g)
      for (const rm of rangeMatches) {
        currentMod.ranges.push({
          value: parseFloat(rm[1]),
          min: parseFloat(rm[2]),
          max: parseFloat(rm[3]),
        })
      }
    }
  }

  if (currentMod) mods.push(currentMod)
  return mods
}
