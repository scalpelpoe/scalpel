// Item classes that have local defense mods
// Inscribed Ultimatum trade filter lookups. Source:
// pathofexile.com/api/trade/data/filters -> ultimatum_filters.
// Keys are lowercased so case-insensitive lookup works without a normalizer
// at every call site.
const ULTIMATUM_CHALLENGE_TEXT_TO_ID: Record<string, string> = {
  'defeat waves of enemies': 'Exterminate',
  survive: 'Survival',
  'protect the altar': 'Defense',
  'stand in the stone circles': 'Conquer',
}

/** The "Reward:" line is a free-form sentence: "Doubles sacrificed Currency",
 *  "Doubles sacrificed Divination Cards", "Mirrored Rare Item", or just a
 *  unique's name (e.g. "The Bringer of Rain") when the reward is "Exchange
 *  for <unique>". Match by keyword against the four trade reward categories;
 *  anything that doesn't match is presumed to be a unique-name fallback. */
function resolveUltimatumRewardId(text: string): string | null {
  const t = text.toLowerCase()
  if (t.includes('divination card')) return 'DoubleDivCards'
  if (t.includes('mirror')) return 'MirrorRare'
  if (t.includes('currency')) return 'DoubleCurrency'
  if (t.length > 0) return 'ExchangeUnique'
  return null
}

/** Display labels for the trade reward category ids. Used as the chip text so
 *  the user sees "Reward Type: Unique" instead of the raw clipboard sentence
 *  ("Doubles sacrificed Divination Cards"), which often duplicates info we
 *  already show on the specific-reward chip. */
const ULTIMATUM_REWARD_ID_LABEL: Record<string, string> = {
  DoubleCurrency: 'Currency',
  DoubleDivCards: 'Divination Cards',
  MirrorRare: 'Mirrored Rare',
  ExchangeUnique: 'Unique',
}

export { resolveUltimatumRewardId, ULTIMATUM_CHALLENGE_TEXT_TO_ID, ULTIMATUM_REWARD_ID_LABEL }
