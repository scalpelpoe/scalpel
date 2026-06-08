/** Hand-curated short tag names for flask mod groups, keyed by the group description.
 *  Mirrors `MOD_TAG_NAMES` in preset-tags.ts (which keys by numeric mod id for maps).
 *  Names use kebab-case so they read like the map tags users already see. */
export const FLASK_MOD_TAG_NAMES: Record<string, string> = {
  // Prefixes
  '#% chance to gain a Flask Charge when you deal a Critical Strike': 'surgeon',
  '#% increased Amount Recovered #% increased Charges per use': '+rec+charges',
  '#% increased Amount Recovered #% reduced Recovery rate': 'saturated',
  '#% increased Charge Recovery #% reduced effect': '+charges-eff',
  '#% increased Charge Recovery': '+charge-rec',
  '#% increased Life Recovered Removes #% of Life Recovered from Mana when used': 'life-from-mana',
  '#% increased Mana Recovered Removes #% of Mana Recovered from Life when used': 'mana-from-life',
  '#% increased Recovery rate': 'bubbling',
  '#% more Recovery if used while on Low Life': 'low-life-rec',
  '#% of Recovery applied Instantly #% reduced Amount Recovered #% increased Recovery rate': 'panicked',
  '#% reduced Charges per use': '-charge-cost',
  'Effect is not removed when Unreserved Mana is Filled Effect does not Queue #% reduced Amount Recovered':
    'mageblood-mod',
  'Gain # Charge when you are Hit by an Enemy': '+1-on-hit',
  'Gain # Charges when you are Hit by an Enemy': '+2-on-hit',
  'Grants #% of Life Recovery to Minions': 'minion-life',
  'Grants Immunity to Bleeding for # seconds if used while Bleeding Grants Immunity to Corrupited Blood for # seconds if used while affected by Corrupted Blood':
    'staunching',
  'Grants Immunity to Bleeding for # seconds if used while Bleeding Grants Immunity to Corrupted Blood for # seconds if used while affected by Corrupted Blood':
    'staunching',
  'Grants Immunity to Chill for # seconds if used while Chilled Grants Immunity to Freeze for # seconds if used while Frozen':
    'heat',
  'Grants Immunity to Hinder for # seconds if used while Hindered Grants Immunity to Maim for # seconds if used while Maimed':
    'gold-bird',
  'Grants Immunity to Ignite for # seconds if used while Ignited Removes all Burning when used': 'dousing',
  'Grants Immunity to Poison for # seconds if used while Poisoned': 'curing',
  'Grants Immunity to Shock for # seconds if used while Shocked': 'grounding',
  'Hinders nearby Enemies with #% reduced Movement Speed if used while not on Full Life': 'low-life-hinder',
  'Hinders nearby Enemies with #% reduced Movement Speed if used while not on Full Mana': 'low-mana-hinder',
  'Instant Recovery #% reduced Amount Recovered': 'instant',
  'Instant Recovery when on Low Life #% reduced Amount Recovered': 'low-life-instant',
  'Mana Recovery occurs instantly at the end of Effect #% increased Amount Recovered': 'eternal',
  "Recover an additional #% of Flask's Life Recovery Amount over # seconds if used while not on Full Life":
    'gluttonous',
  'Removes Curses on use': 'warding',

  // Suffixes
  '#% Chance to Avoid being Stunned during Effect': 'stun-avoid',
  '#% additional Elemental Resistances during Effect': '+ele-res',
  '#% chance to Avoid being Chilled during Effect #% chance to Avoid being Frozen during Effect': 'chill-freeze-avoid',
  '#% chance to Avoid being Ignited during Effect': 'ignite-avoid',
  '#% chance to Avoid being Shocked during Effect': 'shock-avoid',
  '#% chance to Freeze, Shock and Ignite during Effect': 'ailments',
  '#% increased Armour during Effect': '+armour',
  '#% increased Block and Stun Recovery during Effect': '+block-stun-rec',
  '#% increased Critical Strike Chance during Effect': '+crit',
  '#% increased Duration': '+duration',
  '#% increased Evasion Rating during Effect': '+evasion',
  '#% increased Movement Speed during Effect': '+ms',
  '#% increased Ward during Effect': '+ward',
  '#% of Attack Damage Leeched as Life during Effect': 'attack-leech',
  '#% of Spell Damage Leeched as Energy Shield during Effect': 'spell-leech',
  '#% reduced Duration #% increased effect': '+effect',
  '#% reduced Effect of Chill on you during Effect #% reduced Freeze Duration on you during Effect': '-chill-freeze',
  '#% reduced Effect of Curses on you during Effect': '-curse-effect',
  '#% reduced Effect of Shock on you during Effect': '-shock-effect',
  'Immunity to Bleeding and Corrupted Blood during Effect #% less Duration': 'bleed-immune',
  'Immunity to Freeze and Chill during Effect #% less Duration': 'chill-immune',
  'Immunity to Ignite during Effect Removes Burning on use #% less Duration': 'ignite-immune',
  'Immunity to Poison during Effect #% less Duration': 'poison-immune',
  'Immunity to Shock during Effect #% less Duration': 'shock-immune',

  // Both prefix and suffix have these in some flask types
  '+# to Maximum Charges': '+max-charges',
}

/** Look up a short tag for a flask group description; falls back to a truncated form. */
export function getFlaskModTag(description: string): string {
  const curated = FLASK_MOD_TAG_NAMES[description]
  if (curated) return curated
  // Fallback mirrors the maps fallback in preset-tags.ts: strip placeholders, lowercase,
  // trim to 20 chars. Unmapped descriptions still get readable text.
  return description.replace(/#%?/g, '').trim().toLowerCase().substring(0, 20)
}

/** Saturated chip colors for flask category tags. Mirrors `DANGER_COLORS` in map-mods.ts:
 *  the upstream flask tag colors are pastel (low contrast against dark backgrounds and
 *  washed out as chip pill backgrounds), so we map each upstream `tag.name` to a punchy
 *  hex value that reads at a glance. */
export const FLASK_TAG_COLORS: Record<string, string> = {
  default: '#90a4ae', // neutral gray (matches DANGER_COLORS.harmless)
  life: '#ef5350', // saturated red (life flasks are red in PoE)
  ailment: '#ba68c8', // purple (poison / bleed flavor)
  avoidailment: '#81c784', // green (avoiding ailments is a good thing, matches mild)
  eleilment: '#4fc3f7', // cyan (elemental, matches DANGER_COLORS.beneficial)
  leech: '#aed581', // yellow-green (leech / sustain flavor)
  ward: '#9575cd', // indigo (ward color)
  Stun: '#ffd54f', // yellow (stun avoidance, matches DANGER_COLORS.annoying)
}

/** Resolve the chip color for a flask tag. Falls back to the upstream-supplied color
 *  if the upstream introduces a new tag name we haven't mapped yet. */
export function getFlaskTagColor(tagName: string, fallback: string): string {
  return FLASK_TAG_COLORS[tagName] ?? fallback
}
