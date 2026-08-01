// Data sourced from poe-vendor-string (https://github.com/veiset/poe-vendor-string)
// Used with permission. All credit to veiset and contributors.
// @formatter:off
export interface BeastRegex {
  beast: string
  recipe: string
  regex: string
  harvest: boolean
  red: boolean
}
 
export const beastRegex: BeastRegex[] = [
  { beast: "Black Mórrigan", recipe: "Apply a Hinekora's Lock - To a Magic Item; Craft an Aspect Skill onto an Item - Level 30 Aspect of the Avian skill; Craft an Aspect Skill onto an Item - Level 30 Aspect of the Cat skill; Craft an Aspect Skill onto an Item - Level 30 Aspect of the Crab skill; Craft an Aspect Skill onto an Item - Level 30 Aspect of the Spider skill; Fracture two Modifers - On a Rare Talisman with at least 6 modifiers; Modify an Item - to Have Maximum Possible Links; Modify an Item - to Have Maximum Possible Number of Sockets", regex: "k m", harvest: false, red: true},
  { beast: "Craiceann, First of the Deep", recipe: "Craft an Aspect Skill onto an Item - Aspect of the Crab skill; Craft an Aspect Skill onto an Item - Level 30 Aspect of the Crab skill", regex: "n, f", harvest: false, red: true},
  { beast: "Craicic Croaker", recipe: "Apply a Hinekora's Lock - To a Magic Item; Create an Imprint - Of a Magic Item", regex: "c cr", harvest: false, red: true},
  { beast: "Craicic Maw", recipe: "Modify Mods on an Item - Add a Mod to a Crusader Item; Modify Mods on an Item - Add a Mod to a Hunter Item; Modify Mods on an Item - Add a Mod to a Redeemer Item; Modify Mods on an Item - Add a Mod to a Shaper Item; Modify Mods on an Item - Add a Mod to a Warlord Item; Modify Mods on an Item - Add a Mod to an Elder Item", regex: "cic m", harvest: false, red: true},
  { beast: "Craicic Sand Spitter", recipe: "Create Currency Items - A Stack of 2 Orbs of Binding; Create Currency Items - Orb of Fusing; Modify an Item - to Have Maximum Possible Links", regex: "c san", harvest: false, red: true},
  { beast: "Craicic Savage Crab", recipe: "Create a Unique - Item; Modify Mods on an Item - Add a Mod to a Rare Map", regex: "c sav", harvest: false, red: true},
  { beast: "Craicic Shield Crab", recipe: "Create Currency Items - A Stack of 2 Orbs of Binding; Create Currency Items - A Stack of 4 Jeweller's Orbs; Modify an Item - to Have Maximum Possible Number of Sockets", regex: "c sh", harvest: false, red: true},
  { beast: "Craicic Spider Crab", recipe: "Open a Portal - to Craiceann's Cove", regex: "c sp", harvest: false, red: true},
  { beast: "Craicic Squid", recipe: "Transform an Item - Reroll a Talisman Base Type", regex: "c sq", harvest: false, red: true},
  { beast: "Craicic Vassal", recipe: "Corrupt a Map - To have an Implicit Modifier; Corrupt a Map - Twice", regex: "c v", harvest: false, red: true},
  { beast: "Craicic Watcher", recipe: "Create a Unique - Claw or Dagger; Modify Mods on an Item - Add a Mod to a Hunter Item", regex: "c wa", harvest: false, red: true},
  { beast: "Farric Ape", recipe: "Create a Unique - Belt", regex: "c a", harvest: false, red: true},
  { beast: "Farric Chieftain", recipe: "Create a Unique - Amulet", regex: "c ch", harvest: false, red: true},
  { beast: "Farric Flame Hellion Alpha", recipe: "Create a Unique - Ring", regex: "c fl", harvest: false, red: true},
  { beast: "Farric Frost Hellion Alpha", recipe: "Create Currency Items - A Stack of 3 Orbs of Unmaking; Fracture a Modifer - On a Rare Talisman with at least 4 modifiers", regex: "c fr", harvest: false, red: true},
  { beast: "Farric Gargantuan", recipe: "Create a Unique - Helmet; Create Currency Items - A Stack of 3 Orbs of Unmaking", regex: "c ga", harvest: false, red: true},
  { beast: "Farric Goatman", recipe: "Create a Unique - Flask", regex: "c goa", harvest: false, red: true},
  { beast: "Farric Goliath", recipe: "Create a Unique - Bow; Modify Mods on an Item - Add a Mod to a Crusader Item", regex: "c gol", harvest: false, red: true},
  { beast: "Farric Lynx Alpha", recipe: "Modify Mods on an Item - Add a Suffix, Remove a Random Prefix", regex: "c l", harvest: false, red: true},
  { beast: "Farric Magma Hound", recipe: "Create an Item - 23% Quality Corrupted Gem", regex: "ma h", harvest: false, red: true},
  { beast: "Farric Pit Hound", recipe: "Create an Item - Level 21 Corrupted Gem", regex: "c pi", harvest: false, red: true},
  { beast: "Farric Taurus", recipe: "Create a Unique - Map", regex: "c ta", harvest: false, red: true},
  { beast: "Farric Tiger Alpha", recipe: "Open a Portal - to Farrul's Den", regex: "c ti", harvest: false, red: true},
  { beast: "Farric Ursa", recipe: "Create a Unique - Body Armour", regex: "c u", harvest: false, red: true},
  { beast: "Farric Wolf Alpha", recipe: "Modify Mods on an Item - Add a Prefix, Remove a Random Suffix", regex: "c wo", harvest: false, red: true},
  { beast: "Farrul, First of the Plains", recipe: "Craft an Aspect Skill onto an Item - Aspect of the Cat skill; Craft an Aspect Skill onto an Item - Level 30 Aspect of the Cat skill", regex: "ul, f", harvest: false, red: true},
  { beast: "Fenumal Devourer", recipe: "Create a Unique - Shield or Quiver; Modify Mods on an Item - Add a Mod to a Shaper Item", regex: "l de", harvest: false, red: true},
  { beast: "Fenumal Hybrid Arachnid", recipe: "Open a Portal - to Fenumus' Lair", regex: "l hy", harvest: false, red: true},
  { beast: "Fenumal Plagued Arachnid", recipe: "Create an Imprint - Of a Rare Talisman; Fracture two Modifers - On a Rare Talisman with at least 6 modifiers", regex: "l pl", harvest: false, red: true},
  { beast: "Fenumal Queen", recipe: "Create a Unique - Staff; Modify Mods on an Item - Add a Mod to a Redeemer Item", regex: "l q", harvest: false, red: true},
  { beast: "Fenumal Scorpion", recipe: "Convert this Unique Item - Into Another Random Unique Item; Corrupt a Map - Twice", regex: "l sco", harvest: false, red: true},
  { beast: "Fenumal Scrabbler", recipe: "Create a Unique - Wand; Modify Mods on an Item - Add a Mod to a Warlord Item", regex: "l scr", harvest: false, red: true},
  { beast: "Fenumal Widow", recipe: "Create a Unique - Gloves", regex: "l w", harvest: false, red: true},
  { beast: "Fenumus, First of the Night", recipe: "Craft an Aspect Skill onto an Item - Aspect of the Spider skill; Craft an Aspect Skill onto an Item - Level 30 Aspect of the Spider skill", regex: "s, f", harvest: false, red: true},
  { beast: "Primal Crushclaw", recipe: "Create an Item - A valuable Scarab", regex: "l cru", harvest: true, red: true},
  { beast: "Primal Cystcaller", recipe: "Create an Item - Nightmare Map", regex: "l cy", harvest: true, red: true},
  { beast: "Primal Rhex Matriarch", recipe: "Create an Item - Synthesis Unique Map", regex: "ex m", harvest: true, red: true},
  { beast: "Saqawal, First of the Sky", recipe: "Craft an Aspect Skill onto an Item - Aspect of the Avian skill; Craft an Aspect Skill onto an Item - Level 30 Aspect of the Avian skill", regex: "e sk", harvest: false, red: true},
  { beast: "Saqawine Blood Viper", recipe: "Create a Unique - Sword or Axe; Modify Mods on an Item - Add a Mod to an Elder Item", regex: "ne b", harvest: false, red: true},
  { beast: "Saqawine Chimeral", recipe: "Create Currency Items - A Stack of 10 Random Currency", regex: "ne ch", harvest: false, red: true},
  { beast: "Saqawine Cobra", recipe: "Create a Unique - Mace or Sceptre; Modify Mods on an Item - Add a Mod to a Rare Map", regex: "ne co", harvest: false, red: true},
  { beast: "Saqawine Retch", recipe: "Create a Unique - Boots", regex: "ne re", harvest: false, red: true},
  { beast: "Saqawine Rhex", recipe: "Open a Portal - to Saqawal's Roost", regex: "e rhe", harvest: false, red: true},
  { beast: "Saqawine Rhoa", recipe: "Create a Rare - Four-Linked Helmet", regex: "e rho", harvest: false, red: true},
  { beast: "Saqawine Vulture", recipe: "Create an Item - Fully-linked Six-socket Rare", regex: "ne v", harvest: false, red: true},
  { beast: "Vivid Abberarach", recipe: "Create an Item - Shaper Guardian, Elder Guardian or Conqueror Map", regex: "d ab", harvest: true, red: true},
  { beast: "Vivid Vulture", recipe: "Transform an Item - Reroll a Synthesis Implicit Modifier on a Unique Item", regex: "id v", harvest: true, red: true},
  { beast: "Vivid Watcher", recipe: "Sacrifice an Exceptional Support Gem - for 3 high Level, high Quality Support Gems", regex: "id w", harvest: true, red: true},
  { beast: "Wild Brambleback", recipe: "Transform an Item - Adds 500m Experience to an Exceptional Support Gem", regex: "d bra", harvest: true, red: true},
  { beast: "Wild Bristle Matron", recipe: "Modify Mods on an Item - Add a crafted Meta-modifier to a non-Unique Item", regex: "le m", harvest: true, red: true},
  { beast: "Wild Hellion Alpha", recipe: "Modify Mods on an Item - Reroll a Watcher's Eye Modifier", regex: "ld h", harvest: true, red: true},
]