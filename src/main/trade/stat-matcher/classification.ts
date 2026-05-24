// Defence mod patterns -- local on both armour and weapons
const LOCAL_DEFENCE_PATTERNS = [
  /^\+?\d+(?:\.\d+)?%? (?:increased |to )(?:Armour|Evasion Rating|Energy Shield|Armour and Evasion|Armour and Energy Shield|Evasion and Energy Shield|Armour, Evasion and Energy Shield|maximum Energy Shield|Ward)/i,
]

// Offensive mod patterns -- only local on weapons, NOT on armour (gloves, boots, etc.)
const LOCAL_WEAPON_PATTERNS = [
  /^Adds \d+ to \d+ (?:Physical|Fire|Cold|Lightning|Chaos) Damage$/i,
  /^\d+(?:\.\d+)?% increased Attack Speed$/i,
  /^\+\d+ to Accuracy Rating$/i,
  /^\d+(?:\.\d+)?% of Physical Attack Damage Leeched as (?:Life|Mana)$/i,
  /^\d+(?:\.\d+)?% chance to Poison on Hit$/i,
]

function isLocalMod(modText: string, isWeapon: boolean): boolean {
  if (!isWeapon && LOCAL_DEFENCE_PATTERNS.some((p) => p.test(modText))) return true
  if (isWeapon && LOCAL_WEAPON_PATTERNS.some((p) => p.test(modText))) return true
  return false
}

// Mods that are generally not useful for pricing
const LOW_PRIORITY_PATTERNS = [
  /rarity of items found/i,
  /light radius/i,
  /mana regeneration rate/i,
  /reflects .* physical damage/i,
  /knockback/i,
  /reduced attribute requirements/i,
  /increased stun duration/i,
  /life regenerated per second/i,
  /thorns/i,
  /stun and block recovery/i,
  /stun duration on enemies/i,
  /adds.*passive skills/i,
  /small passive skills which grant nothing/i,
]

function isLowPriority(modText: string): boolean {
  return LOW_PRIORITY_PATTERNS.some((p) => p.test(modText))
}

const DEFENSE_MOD_PATTERNS = [
  /to armour/i,
  /increased armour/i,
  /to evasion rating/i,
  /increased evasion rating/i,
  /to maximum energy shield/i,
  /increased maximum energy shield/i,
  /to ward/i,
  /increased ward/i,
  /chance to block/i,
]

function isDefenseMod(modText: string): boolean {
  return DEFENSE_MOD_PATTERNS.some((p) => p.test(modText))
}

export { isDefenseMod, isLocalMod, isLowPriority }
