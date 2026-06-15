import itemIconsPoe1 from '@shared/data/items/item-icons-poe1.json'
import itemIconsPoe2 from '@shared/data/items/item-icons-poe2.json'

function buildCurrencyIcons(icons: Record<string, string>): Record<string, string> {
  const entries: Record<string, string> = {}
  const pairs: Array<[string, string]> = [
    ['chaos', 'Chaos Orb'],
    ['divine', 'Divine Orb'],
    ['exa', 'Exalted Orb'],
    ['exalted', 'Exalted Orb'],
    ['alch', 'Orb of Alchemy'],
    ['alt', 'Orb of Alteration'],
    ['mirror', 'Mirror of Kalandra'],
    ['chrom', 'Chromatic Orb'],
    ['blessed', 'Blessed Orb'],
    ['fusing', 'Orb of Fusing'],
    ['jewellers', "Jeweller's Orb"],
    ['jew', "Jeweller's Orb"],
    ['regal', 'Regal Orb'],
    ['annul', 'Orb of Annulment'],
    ['vaal', 'Vaal Orb'],
    ['chance', 'Orb of Chance'],
    ['aug', 'Orb of Augmentation'],
    ['regret', 'Orb of Regret'],
    ['scour', 'Orb of Scouring'],
    ['transmute', 'Orb of Transmutation'],
    ['wisdom', 'Scroll of Wisdom'],
    ['portal', 'Portal Scroll'],
    ['scrap', "Armourer's Scrap"],
    ['whetstone', "Blacksmith's Whetstone"],
    ['gcp', "Gemcutter's Prism"],
    ['bauble', "Glassblower's Bauble"],
  ]
  for (const [key, name] of pairs) {
    const url = icons[name]
    if (url) entries[key] = url
  }
  return entries
}

const CURRENCY_ICONS_POE1: Record<string, string> = buildCurrencyIcons(itemIconsPoe1 as Record<string, string>)
const CURRENCY_ICONS_POE2: Record<string, string> = buildCurrencyIcons(itemIconsPoe2 as Record<string, string>)

export function getCurrencyIconMap(version: 1 | 2): Record<string, string> {
  return version === 2 ? CURRENCY_ICONS_POE2 : CURRENCY_ICONS_POE1
}
