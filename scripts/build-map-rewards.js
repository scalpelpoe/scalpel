// Join the English poe.re tokens pinned by sync-regex to RePoE's rollable map affixes.
// All languages share the same token IDs. Reward percentages are base values before map scaling.
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const statKeys = {
  'map_currency_drop_chance_+%_final_from_uber_mod': 'morecurrency',
  'map_scarab_drop_chance_+%_final_from_uber_mod': 'morescarabs',
  'map_map_item_drop_chance_+%_final_from_uber_mod': 'moremaps',
  'map_item_drop_rarity_+%': 'rarity',
  'map_drop_scaling_+%': 'quantity',
  'map_pack_size_+%': 'packsize',
}
const poeReKeys = {
  Currency: 'morecurrency',
  Threads: 'morescarabs',
  Maps: 'moremaps',
  Rarity: 'rarity',
  Atlas: 'quantity',
}
// Originator/Nightmare maps also roll ordinary affix variants when an uber affix is present.
const pools = {
  nightmare: /^uber_tier_map$/,
  regular: /^(low_tier_map|mid_tier_map|top_tier_map|has_uber_map_prefix|has_uber_map_suffix|map|default)$/,
}
const rewardLine = /^\d+% (?:increased (?:Atlas Drops in this Area|Rarity of Items found in this Area|Pack size)|more (?:Currency|Threads|Maps) found in Area)$/i
const displayText = (s) => s.replace(/\[(?:[^\]|]*\|)?([^\]]+)\]/g, '$1')

// Some tiers have different rolls or a different order of lines for the same token.
// Match every non-reward line, the affix slot and the map pool before trusting a value.
function affixKey(pool, slot, lines) {
  const normalized = lines.map((line) => line.trim().toLowerCase().replace(/\+?(?:\([\d-]+\)|\d+)/g, '#'))
  return [pool, slot, ...normalized.sort()].join('|')
}

function indexMods(gameMods) {
  const candidates = new Map()
  for (const mod of Object.values(gameMods)) {
    if (mod.domain !== 'area' || !mod.text || !['prefix', 'suffix'].includes(mod.generation_type)) continue
    const weights = mod.spawn_weights.filter((w) => w.weight > 0)
    const lines = displayText(mod.text).split('\n').filter((line) => !rewardLine.test(line))
    for (const [pool, tag] of Object.entries(pools)) {
      if (!weights.some((w) => tag.test(w.tag.trim()))) continue
      const key = affixKey(pool, mod.generation_type, lines)
      const matches = candidates.get(key) ?? []
      matches.push(mod)
      candidates.set(key, matches)
    }
  }
  return candidates
}

function tokenRewards(token, candidates) {
  const pool = token.options.nm ? 'nightmare' : 'regular'
  const slot = token.options.prefix ? 'prefix' : 'suffix'
  const matches = candidates.get(affixKey(pool, slot, displayText(token.rawText).split('|'))) ?? []
  const rewards = {}
  for (const [stat, id] of Object.entries(statKeys)) {
    // Only publish a single percentage when every matching tier agrees on it.
    const values = matches.flatMap((mod) => {
      const roll = mod.stats.find((s) => s.id === stat)
      return roll ? [roll.min, roll.max] : [0]
    })
    if (values[0] > 0 && values.every((v) => v === values[0])) rewards[id] = values[0]
  }
  for (const { type, value } of token.options.rewards ?? []) {
    const id = poeReKeys[type]
    if (!id || !Number.isFinite(value)) continue
    if (matches.length && rewards[id] !== value) throw new Error(`Conflicting ${type} values for ${token.rawText}`)
    rewards[id] = value
  }
  if (!matches.length) console.warn(`No RePoE match for ${token.rawText}; retaining published poe.re bonuses only`)
  return rewards
}

async function syncMapRewards({ tokenUrl, sha256, force, userAgent, get }) {
  const dest = path.join(__dirname, '../src/shared/data/regex/map-rewards.json')
  const previous = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : {}
  const modsUrl = 'https://repoe-fork.github.io/mods.min.json'
  const headers = { 'User-Agent': userAgent }
  if (!force && previous.tokens === tokenUrl && previous.tokenSha256 === sha256 && previous.modsEtag) {
    headers['If-None-Match'] = previous.modsEtag
  }
  const res = await fetch(modsUrl, { headers })
  if (res.status === 304) return
  if (!res.ok) throw new Error(`${modsUrl}: HTTP ${res.status}`)
  const [mods, tokenData] = await Promise.all([res.json(), get(tokenUrl)])
  if (createHash('sha256').update(tokenData).digest('hex') !== sha256) throw new Error('Map token checksum mismatch')
  const candidates = indexMods(mods)
  const { tokens } = JSON.parse(tokenData)
  const rewards = Object.fromEntries(tokens.map((t) => [t.id, tokenRewards(t, candidates)]))
  const output = { tokens: tokenUrl, tokenSha256: sha256, mods: modsUrl, modsEtag: res.headers.get('etag'), rewards }
  fs.writeFileSync(dest, `${JSON.stringify(output, null, 2)}\n`)
  console.log(`[sync-regex] Wrote map rewards for ${tokens.length} tokens`)
}

module.exports = { syncMapRewards }
