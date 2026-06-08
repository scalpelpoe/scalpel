import { MAP_MODS, DANGER_COLORS, type Danger } from '../../../../shared/data/regex/map-mods'
import { QUALIFIERS } from './Qualifiers'
import type { RegexPresetTag } from '../../../../shared/types'
import { TAB_COLORS } from './mapmods-helpers'

/** Hand-curated short tag names for map mods, keyed by mod ID */
const MOD_TAG_NAMES: Record<number, string> = {
  // Nightmare
  [-2064669900]: 'synth', // Map Boss is accompanied by a Synthesis Boss
  [-2038489408]: '-all-res', // Players have -20% to all maximum Resistances
  [-1940135977]: '+block', // Monsters have +50% Chance to Block Attack Damage
  [-1818595967]: 'shaper-touched', // Rare monsters in area are Shaper-Touched
  [-1647756153]: 'inc-rare-nm', // Rare Monsters each have 1 additional Modifier|(35-45)% increased number of Rare Monsters
  [-1629200695]: 'tentacles', // Area contains Unstable Tentacle Fiends
  [-1621497665]: '+frenzy+max', // Monsters gain a Frenzy Charge on Hit|Monsters have +1 to Maximum Frenzy Charges
  [-1430865583]: 'refl-nm', // Monsters reflect 20% of Physical Damage|Monsters reflect 20% of Elemental Damage
  [-949334443]: 'chain', // Monsters' skills Chain 3 additional times|Monsters' Projectiles can Chain when colliding with Terrain
  [-933231182]: '+mob-speed', // (35-45)% increased Monster Cast Speed|(35-45)% increased Monster Attack Speed|(25-30)% increased Monster Movement Speed
  [-931745379]: 'vines', // Monsters inflict 2 Grasping Vines on Hit
  [-887278806]: 'drowning-orbs', // Area contains Drowning Orbs
  [-645418310]: 'phys-as-ele', // Monsters gain (180-200)% of their Physical Damage as Extra Damage of a random Element
  [-258709095]: 'mob-res', // +50% Monster Physical Damage Reduction|+55% Monster Elemental Resistances|+35% Monster Chaos Resistance
  [-126908257]: 'mobs-ailment', // Monsters Ignite, Freeze and Shock on Hit|All Monster Damage can Ignite, Freeze and Shock
  [-105914721]: '-flask', // Players have 40% less effect of Flasks applied to them
  [127168403]: 'phys-as-chaos', // Monsters gain (80-100)% of their Physical Damage as Extra Chaos Damage
  [246480838]: '+crit-nm', // +(70-75)% to Monster Critical Strike Multiplier|Monsters have (650-700)% increased Critical Strike Chance
  [284489036]: '-aoe-nm', // Players have (30-25)% less Area of Effect
  [357242916]: '+endurance+max', // Monsters have +1 to Maximum Endurance Charges|Monsters gain an Endurance Charge when hit
  [639399394]: 'shrine-buff', // Unique Monsters have a random Shrine Buff
  [647925005]: 'cursed-nm', // Players are Cursed with Vulnerability|Players are Cursed with Temporal Chains|Players are Cursed with Elemental Weakness
  [670500310]: 'no-stunslow', // Monsters cannot be Stunned|Monsters' Action Speed cannot be modified to below Base Value|Monsters' Movement Speed cannot be modified to below Base Value
  [707446389]: 'exarch', // Area contains Runes of the Searing Exarch
  [972998450]: 'revive', // Rare monsters in area Temporarily Revive on death
  [1014295028]: 'poison-nm', // Monsters Poison on Hit|Monsters have 100% increased Poison Duration|All Damage from Monsters' Hits can Poison
  [1061710360]: 'sawblades', // Players are assaulted by Bloodstained Sawblades
  [1117764869]: 'debuffs-expire', // Debuffs on Monsters expire 100% faster
  [1205583947]: 'less-leech', // Players have (60-50)% reduced Maximum total Life, Mana and Energy Shield Recovery per second from Leech
  [1313044496]: 'rare-fracture', // 25% chance for Rare Monsters to Fracture on death
  [1333860371]: 'meteor', // Players are targeted by a Meteor when they use a Flask
  [1464066514]: 'less-defence', // Players have (30-25)% less Defences
  [1469490158]: '+proj+aoe', // Monsters fire 2 additional Projectiles|Monsters have 100% increased Area of Effect
  [1494523238]: '+power+max', // Monsters gain a Power Charge on Hit|Monsters have +1 to Maximum Power Charges
  [1538178254]: 'lab-hazards', // Area contains Labyrinth Hazards
  [1665221611]: 'volatile-cores', // Rare Monsters have Volatile Cores
  [1756122717]: 'maven', // The Maven interferes with Players
  [1861748274]: 'auras2mobs', // Auras from Player Skills which affect Allies also affect Enemies
  [1932675161]: 'marked-ground', // Area contains patches of moving Marked Ground, inflicting random Marks
  // Lethal
  [-2050206104]: '-recovery', // Players have (20-60)% less Recovery Rate of Life and Energy Shield (650)
  [-477049138]: '-max-res', // Players have -(5-12)% to all maximum Resistances (980)
  [-235013251]: 'phys-refl', // Monsters reflect (13-18)% of Physical Damage (1000)
  [252096506]: 'no-leech', // Monsters cannot be Leeched from (600)
  [1078205993]: 'ele-refl', // Monsters reflect (13-18)% of Elemental Damage (1000)
  [1101434369]: '-aura', // Players have (25-60)% reduced effect of Non-Curse Auras from Skills (990)
  [1305115176]: 'no-regen', // Players cannot Regenerate Life, Mana or Energy Shield (700)
  // Beneficial
  [-683043845]: 'inc-rare', // (20-30)% increased number of Rare Monsters (1)
  [583869527]: 'inc-magic', // (20-30)% increased Magic Monsters (0)
  // Dangerous / Annoying / Mild / Harmless
  [-1772662453]: 'avoid-ailments', // Monsters have (30-70)% chance to Avoid Elemental Ailments (150)
  [-1616686189]: 'life-as-es', // Monsters gain (20-80)% of Maximum Life as Extra Maximum Energy Shield (240)
  [-1473394034]: '-cooldown', // Players have (20-40)% less Cooldown Recovery Rate (94)
  [-1358177810]: 'steal-charges', // Monsters steal Power, Frenzy and Endurance charges on Hit (80)
  [-1344829253]: 'crit-chance+multi', // Monsters have (160-400)% increased Critical Strike Chance|+(30-45)% to Monster Critical Strike Multiplier (500)
  [-1204380788]: 'impale', // Monsters' Attacks have (25-60)% chance to Impale on Hit (98)
  [-1158025910]: 'pen-ele-res', // Monster Damage Penetrates 15% Elemental Resistances (310 - nm variant is 1001)
  [-1139261923]: 'consecrated-ground', // Area has patches of Consecrated Ground (310)
  [-1099682289]: 'totems', // Area contains many Totems (9)
  [-1094717370]: 'frenzy-charge', // Monsters gain a Frenzy Charge on Hit (80)
  [-1088873049]: 'boss-dmg+speed', // Unique Boss deals (15-25)% increased Damage|Unique Boss has (20-30)% increased Attack and Cast Speed (420)
  [-999805715]: '-block+armour', // Players have (20-40)% reduced Chance to Block|Players have (20-30)% less Armour (295)
  [-946283701]: 'buffs-expire', // Buffs on Players expire (30-100)% faster (96)
  [-763914456]: '-flask-charges', // Players gain (30-50)% reduced Flask Charges (210)
  [-694214737]: 'chaos+ele-res', // +(15-25)% Monster Chaos Resistance|+(20-40)% Monster Elemental Resistances (100)
  [-627831782]: 'avoid-poison+bleed', // Monsters have a (20-50)% chance to avoid Poison, Impale, and Bleeding (390)
  [-580302769]: '+monster-dmg', // (14-40)% increased Monster Damage (370)
  [-539026720]: '-curse-effect', // (25-60)% less effect of Curses on Monsters (363)
  [-481946502]: 'chain-2', // Monsters' skills Chain 2 additional times (380)
  [-268547495]: 'suppress-spell', // Monsters have +(30-100)% chance to Suppress Spell Damage (290)
  [-225071089]: 'endurance-charge', // Monsters gain an Endurance Charge on Hit (80)
  [-172005981]: 'more-life', // (20-100)% more Monster Life (100)
  [-166549521]: 'ignite+freeze+shock', // Monsters have a (15-20)% chance to Ignite, Freeze and Shock on Hit (98)
  [-128171261]: 'desecrated-ground', // Area has patches of desecrated ground (310)
  [-114660370]: '-accuracy', // Players have (15-25)% less Accuracy Rating (85)
  [-106750911]: 'boss-life+aoe', // Unique Boss has (25-35)% increased Life|Unique Boss has (45-70)% increased Area of Effect (400)
  [-106071007]: 'possessed', // Unique Bosses are Possessed (90)
  [-80588106]: 'maim', // Monsters Maim on Hit with Attacks (50)
  [-54649013]: '-crit-dmg-taken', // Monsters take (25-45)% reduced Extra Damage from Critical Strikes (250)
  [-26777606]: 'extra-fire', // Monsters deal (50-110)% extra Physical Damage as Fire (450)
  [10729340]: 'chaos+wither', // Monsters gain (21-35)% of their Physical Damage as Extra Chaos Damage|Monsters Inflict Withered for 2 seconds on Hit (455)
  [17483843]: 'move+atk+cast-spd', // (15-30)% increased Monster Movement Speed|(20-45)% increased Monster Attack Speed|(20-45)% increased Monster Cast Speed (420)
  [151806012]: '-suppress+acc', // Players have -(10-20)% to amount of Suppressed Spell Damage Prevented|Monsters have (30-50)% increased Accuracy Rating (365)
  [156744008]: 'monster-variety', // Area has increased monster variety (8)
  [339937661]: 'enfeeble', // Players are Cursed with Enfeeble (360)
  [472035128]: 'shocked-ground', // Area has patches of Shocked Ground which increase Damage taken by (20-50)% (310)
  [823410479]: 'phys-dmg-reduction', // +(20-40)% Monster Physical Damage Reduction (150)
  [829751875]: '-aoe', // Players have (15-25)% less Area of Effect (60)
  [955801458]: 'two-bosses', // Area contains two Unique Bosses (90)
  [1062763755]: 'chilled-ground', // Area has patches of Chilled Ground (310)
  [1202132179]: 'vulnerability', // Players are Cursed with Vulnerability (360)
  [1211148661]: 'burning-ground', // Area has patches of Burning Ground (310)
  [1283094925]: 'power-charge', // Monsters gain a Power Charge on Hit (80)
  [1428847539]: 'no-exposure', // Players cannot inflict Exposure (150)
  [1541760497]: 'no-stun+more-life', // Monsters cannot be Stunned|(15-30)% more Monster Life (100)
  [1551446200]: 'hexproof', // Monsters are Hexproof (150)
  [1578069823]: 'poison', // Monsters Poison on Hit (390)
  [1598599541]: 'temporal-chains', // Players are Cursed with Temporal Chains (360)
  [1634487773]: 'extra-proj', // Monsters fire 2 additional Projectiles (440)
  [1743546402]: 'hinder', // Monsters Hinder on Hit with Spells (50)
  [1799781772]: 'extra-cold', // Monsters deal (50-110)% extra Physical Damage as Cold (450)
  [1882321261]: 'ele-weakness', // Players are Cursed with Elemental Weakness (360)
  [1899039946]: '+aoe', // Monsters have (45-100)% increased Area of Effect (400)
  [2080363489]: 'always-ignite', // All Monster Damage from Hits always Ignites (99)
  [2105788016]: 'no-slow+no-taunt', // Monsters' Action Speed cannot be modified to below Base Value|Monsters cannot be Taunted (89)
  [2122294281]: 'blind', // Monsters Blind on Hit (50)
  [2132856290]: 'extra-lightning', // Monsters deal (50-110)% extra Physical Damage as Lightning (450)
  [-1934587276]: 'kitava', // Area is inhabited by Cultists of Kitava
  [-1047451686]: 'ranged', // Area is inhabited by ranged monsters
  [-737013402]: 'lunaris', // Area is inhabited by Lunaris fanatics
  [-688435205]: 'undead', // Area is inhabited by Undead
  [-617888797]: 'humanoids', // Area is inhabited by Humanoids
  [-210607554]: 'goatmen', // Area is inhabited by Goatmen
  [58884108]: 'skeletons', // Area is inhabited by Skeletons
  [194321329]: 'solaris', // Area is inhabited by Solaris fanatics
  [775962019]: 'sea-witches', // Area is inhabited by Sea Witches and their Spawn
  [980061401]: 'demons', // Area is inhabited by Demons
  [1082020744]: 'abominations', // Area is inhabited by Abominations
  [1424047266]: 'animals', // Area is inhabited by Animals
  [1723792253]: 'ghosts', // Area is inhabited by Ghosts
}

/** Short display names for qualifier IDs */
const QUALIFIER_TAG_NAMES: Record<string, string> = {
  quantity: 'quant',
  packsize: 'pack',
  morecurrency: '+currency',
  morescarabs: '+scarabs',
  moremaps: '+maps',
  rarity: 'rarity',
  quality: 'qual',
  quality_packsize: 'mq-pack',
  quality_rarity: 'mq-rarity',
  quality_currency: 'mq-curr',
  quality_divination: 'mq-divs',
  quality_scarab: 'mq-scarabs',
}

/** Build a mod ID -> short tag lookup */
const modTagCache = new Map<number, string>()
function getModTag(id: number): string {
  if (MOD_TAG_NAMES[id]) return MOD_TAG_NAMES[id]
  if (modTagCache.has(id)) return modTagCache.get(id)!
  // Fallback for unmapped mods: truncate the raw text
  const mod = MAP_MODS.find((m) => m.id === id)
  if (!mod) return 'unknown'
  const fallback = mod.text.split('|')[0].replace(/#%?/g, '').trim().toLowerCase().substring(0, 20)
  modTagCache.set(id, fallback)
  return fallback
}

function getModDanger(id: number): Danger | null {
  const mod = MAP_MODS.find((m) => m.id === id)
  return mod ? mod.danger : null
}

/** Generate auto-tags from the current regex state */
export function generatePresetTags(state: {
  avoid: Set<number>
  want: Set<number>
  qualifiers: Record<string, number | null>
}): RegexPresetTag[] {
  const tags: RegexPresetTag[] = []

  // Qualifier tags
  for (const q of QUALIFIERS) {
    const val = state.qualifiers[q.id]
    if (val != null && val > 0) {
      tags.push({
        text: `${val} ${QUALIFIER_TAG_NAMES[q.id] || q.id}`,
        color: TAB_COLORS.want,
        source: 'qualifier',
        sourceId: q.id,
      })
    }
  }

  // Avoid tags
  for (const id of state.avoid) {
    const danger = getModDanger(id)
    const color = danger ? DANGER_COLORS[danger] : TAB_COLORS.avoid
    tags.push({ text: getModTag(id), color, source: 'avoid', sourceId: id })
  }

  // Want tags
  for (const id of state.want) {
    const danger = getModDanger(id)
    const color = danger ? DANGER_COLORS[danger] : TAB_COLORS.want
    tags.push({ text: getModTag(id), color, source: 'want', sourceId: id })
  }

  return tags
}

export const CUSTOM_TAG_COLOR = TAB_COLORS.custom
