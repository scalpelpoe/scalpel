import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const detailsPath = path.join(root, '..', 'scarab-details.json')
const densePath = path.join(root, '..', 'dense-allflame.json')
const outPath = path.join(
  root,
  'src',
  'renderer',
  'src',
  'features',
  'scarab-atlas',
  'scarab-catalog.json',
)

const CATEGORY_META = {
  horned: { name: 'Horned', atlasModifier: 'none', investmentBoost: false },
  divination: { name: 'Divination', atlasModifier: 'boostable', investmentBoost: false },
  ultimatum: { name: 'Ultimatum', atlasModifier: 'blockable', investmentBoost: true },
  harvest: { name: 'Harvest', atlasModifier: 'blockable', investmentBoost: true },
  trarthan: { name: 'Trarthan', atlasModifier: 'blockable', investmentBoost: true },
  ambush: { name: 'Ambush', atlasModifier: 'boostable', investmentBoost: false },
  cartography: { name: 'Cartography', atlasModifier: 'boostable', investmentBoost: false },
  kalguuran: { name: 'Kalguuran', atlasModifier: 'blockable', investmentBoost: true },
  breach: { name: 'Breach', atlasModifier: 'blockable', investmentBoost: true },
  misc: { name: 'Miscellaneous', atlasModifier: 'none', investmentBoost: false },
  domination: { name: 'Domination', atlasModifier: 'boostable', investmentBoost: false },
  essence: { name: 'Essence', atlasModifier: 'boostable', investmentBoost: false },
  legion: { name: 'Legion', atlasModifier: 'blockable', investmentBoost: true },
  bestiary: { name: 'Bestiary', atlasModifier: 'none', investmentBoost: true },
  delirium: { name: 'Delirium', atlasModifier: 'blockable', investmentBoost: true },
  ritual: { name: 'Ritual', atlasModifier: 'blockable', investmentBoost: true },
  abyss: { name: 'Abyss', atlasModifier: 'blockable', investmentBoost: true },
  blight: { name: 'Blight', atlasModifier: 'blockable', investmentBoost: true },
  titanic: { name: 'Titanic', atlasModifier: 'boostable', investmentBoost: false },
  sulphite: { name: 'Sulphite', atlasModifier: 'none', investmentBoost: false },
  anarchy: { name: 'Anarchy', atlasModifier: 'boostable', investmentBoost: false },
  influencing: { name: 'Influencing', atlasModifier: 'blockable', investmentBoost: true },
  betrayal: { name: 'Betrayal', atlasModifier: 'blockable', investmentBoost: true },
  incursion: { name: 'Incursion', atlasModifier: 'blockable', investmentBoost: true },
  torment: { name: 'Torment', atlasModifier: 'boostable', investmentBoost: false },
  beyond: { name: 'Beyond', atlasModifier: 'boostable', investmentBoost: false },
  expedition: { name: 'Expedition', atlasModifier: 'blockable', investmentBoost: true },
  harbinger: { name: 'Harbinger', atlasModifier: 'boostable', investmentBoost: false },
}

const VENDOR_CATEGORY_ORDER = [
  'titanic',
  'sulphite',
  'divination',
  'anarchy',
  'ritual',
  'harvest',
  'kalguuran',
  'influencing',
  'bestiary',
  'trarthan',
  'betrayal',
  'incursion',
  'domination',
  'torment',
  'cartography',
  'beyond',
  'ambush',
  'ultimatum',
  'expedition',
  'delirium',
  'legion',
  'blight',
  'abyss',
  'essence',
  'breach',
  'misc',
  'horned',
]

const PREFIXES = [
  'Horned',
  'Divination',
  'Ultimatum',
  'Harvest',
  'Ambush',
  'Cartography',
  'Kalguuran',
  'Breach',
  'Domination',
  'Essence',
  'Legion',
  'Bestiary',
  'Delirium',
  'Ritual',
  'Abyss',
  'Blight',
  'Titanic',
  'Harbinger',
  'Beyond',
  'Torment',
  'Anarchy',
  'Betrayal',
  'Expedition',
  'Incursion',
  'Influencing',
  'Sulphite',
  'Reliquary',
  'Trarthan',
]

function categoryIdForName(name) {
  for (const p of PREFIXES) {
    if (name === `${p} Scarab` || name.startsWith(`${p} Scarab`) || name.startsWith(`${p} `)) {
      return p.toLowerCase()
    }
  }
  return 'misc'
}

function assignSignatures(scarabs) {
  const lowerNames = scarabs.map((s) => s.name.toLowerCase())
  for (const scarab of scarabs) {
    const candidates = []
    const ofMatch = scarab.name.match(/ of (.+)$/i)
    if (ofMatch) candidates.push(ofMatch[1])
    for (const word of scarab.name.split(/\s+/)) {
      if (!/^(scarab|of|the|a)$/i.test(word)) candidates.push(word)
    }
    candidates.push(scarab.name.replace(/ Scarab$/i, '').replace(/^Scarab of /i, ''))
    candidates.sort((a, b) => a.length - b.length)

    let sig = null
    for (const c of candidates) {
      const cl = c.toLowerCase()
      if (cl.length < 2) continue
      if (lowerNames.filter((n) => n.includes(cl)).length === 1) {
        sig = c
        break
      }
    }
    if (!sig) {
      const lower = scarab.name.toLowerCase()
      outer: for (let len = 3; len <= lower.length; len++) {
        for (let i = 0; i <= lower.length - len; i++) {
          const sub = lower.slice(i, i + len)
          if (lowerNames.filter((n) => n.includes(sub)).length === 1) {
            sig = scarab.name.slice(i, i + len)
            break outer
          }
        }
      }
    }
    scarab.signature = sig || scarab.name
  }
}

const details = JSON.parse(fs.readFileSync(detailsPath, 'utf8'))
const byName = new Map(details.map((d) => [d.name, d]))

if (fs.existsSync(densePath)) {
  const dense = JSON.parse(fs.readFileSync(densePath, 'utf8'))
  const scarabOverview = (dense.itemOverviews || []).find((o) => o.type === 'Scarab')
  for (const line of scarabOverview?.lines || []) {
    if (!byName.has(line.name)) {
      byName.set(line.name, {
        name: line.name,
        id: line.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, ''),
        dropWeight: null,
        limit: null,
      })
    }
  }
}

const scarabs = [...byName.values()].map((d) => ({
  id: d.id,
  name: d.name,
  weight: typeof d.dropWeight === 'number' ? d.dropWeight : 0,
  categoryId: categoryIdForName(d.name),
  signature: '',
  limit: d.limit ?? null,
}))

assignSignatures(scarabs)

const byCat = new Map()
for (const s of scarabs) {
  if (!byCat.has(s.categoryId)) byCat.set(s.categoryId, [])
  byCat.get(s.categoryId).push({
    id: s.id,
    name: s.name,
    weight: s.weight,
    signature: s.signature,
    limit: s.limit,
  })
}

const order = [...VENDOR_CATEGORY_ORDER]
for (const id of byCat.keys()) {
  if (!order.includes(id)) order.push(id)
}

const categories = order
  .filter((id) => byCat.has(id))
  .map((id) => {
    const meta = CATEGORY_META[id] || {
      name: id.charAt(0).toUpperCase() + id.slice(1),
      atlasModifier: 'none',
      investmentBoost: false,
    }
    return {
      id,
      name: meta.name,
      atlasModifier: meta.atlasModifier,
      investmentBoost: meta.investmentBoost,
      scarabs: byCat.get(id).sort((a, b) => a.name.localeCompare(b.name)),
    }
  })

const catalog = {
  version: 1,
  vendorCategoryOrder: VENDOR_CATEGORY_ORDER,
  categories,
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + '\n')
console.log('Wrote', outPath, 'scarabs', scarabs.length, 'categories', categories.length)
