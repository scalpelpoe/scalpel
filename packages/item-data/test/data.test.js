const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { validateMap, snapshot } = require('../scripts/validate')
const { collectCandidates, buildArtIndex } = require('../scripts/sync-item-icons-poe1')
const { collectCandidates: collectPoe2 } = require('../scripts/sync-item-icons-poe2')
const url = 'https://web.poecdn.com/image/Art/2DItems/Test.png'

test('both datasets match their reviewed coverage and byte snapshots', () => {
  assert.deepEqual(snapshot(path.join(__dirname, '..')), require('../integrity.json'))
})

test('validator rejects malformed data, duplicate names and non-CDN URLs', () => {
  for (const text of ['[]', '{}', '{"A":2}', '{" A":"' + url + '"}', '{"A":"' + url + '","A":"' + url + '"}',
    '{"A":"http://web.poecdn.com/image/a.png"}', '{"A":"https://evil.example/image/a.png"}', '{"A":"https://web.poecdn.com.evil.example/image/a.png"}'])
    assert.throws(() => validateMap(text))
  assert.deepEqual(validateMap(JSON.stringify({ 'Test Item': url })), { 'Test Item': url })
})

test('PoE1 sync preserves shipped icons, static priority and unique/base separation', () => {
  const candidates = collectCandidates({ result: [{ entries: [
    { text: 'Heading', id: 'sep' }, { text: 'Existing', image: '/image/new.png' },
    { text: 'Currency', image: '/image/currency.png' },
  ] }] }, { result: [{ entries: [{ type: 'Base' }, { name: 'Unique', type: 'Base' }] }] }, { Existing: url })
  assert.deepEqual([...candidates], [['Currency', 'https://web.poecdn.com/image/currency.png'], ['Base', null]])
  const art = buildArtIndex({ a: { name: 'Base', visual_identity: { dds_file: 'Art/Base.dds' } },
    b: { name: 'Ring', item_class: 'Ring', tags: ['not_for_sale'], visual_identity: { dds_file: 'Wrong.dds' } } })
  assert.equal(art.get('Base'), 'https://web.poecdn.com/image/Art/Base.png')
  assert.equal(art.has('Ring'), false)
})

test('PoE2 import preserves existing icons and separates uniques from bases', () => {
  const result = [{ item: { rarity: 'Unique', name: 'Unique', baseType: 'Base', icon: url } },
    { item: { rarity: 'Rare', baseType: 'Base', icon: url } },
    { item: { rarity: 'Unique', baseType: 'Unnamed', icon: url } },
    { item: { rarity: 'Rare', baseType: 'Existing', icon: url } }]
  assert.deepEqual([...collectPoe2({ result }, { Existing: url })], [['Unique', url], ['Base', url]])
  assert.throws(() => collectPoe2({ result: [result[0], { item: { ...result[0].item, icon: url + '?v=2' } }] }, {}), /Conflicting/)
})

test('retired PoE2 names stay absent and replacement names retain art', () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, '../poe2.json'), 'utf8'))
  for (const name of ['Vaal Infuser', 'Verisium Cuffs', 'Gladiatoral Helm', 'Shock Conduction I',
    'Breach Precursor Tablet', 'Delirium Precursor Tablet', 'Ritual Precursor Tablet', 'Overseer Precursor Tablet',
    'Abyss Precursor Tablet', 'Irradiated Precursor Tablet', 'Omen of Recombination', 'Expedition Precursor Tablet'])
    assert.equal(Object.hasOwn(map, name), false, name)
  for (const name of ["Vaal Armourer's Infuser", 'Kalguuran Cuffs', 'Cassis Helm', 'Breach Tablet',
    'Delirium Tablet', 'Ritual Tablet', 'Overseer Tablet', 'Abyss Tablet']) assert.ok(map[name], name)
})
