const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')

function validateMap(text) {
  const map = JSON.parse(text)
  if (!map || Array.isArray(map) || typeof map !== 'object' || !Object.keys(map).length)
    throw new Error('Expected a nonempty item map')
  // The schema is flat: every property value is a URL string. Detect duplicate
  // JSON keys before JSON.parse's last-value-wins behavior can conceal one.
  const keys = [...text.matchAll(/(?:^|[,{])\s*("(?:[^"\\]|\\.)*")\s*:/g)].map((m) => JSON.parse(m[1]))
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate item name')
  for (const [name, value] of Object.entries(map)) {
    if (!name.trim() || name.trim() !== name || ['__proto__', 'constructor', 'prototype'].includes(name))
      throw new Error(`Invalid item name: ${name}`)
    if (typeof value !== 'string' || /\s/.test(value)) throw new Error(`Invalid URL for ${name}`)
    const url = new URL(value)
    if (url.origin !== 'https://web.poecdn.com' || url.username || url.password || url.hash ||
      !/^\/(gen\/image|image)\/.+/.test(url.pathname)) throw new Error(`Invalid CDN URL for ${name}`)
  }
  return map
}

function snapshot(directory) {
  return Object.fromEntries([1, 2].map((game) => {
    const data = fs.readFileSync(path.join(directory, `poe${game}.json`))
    const map = validateMap(data.toString('utf8'))
    return [`poe${game}.json`, { count: Object.keys(map).length, sha256: createHash('sha256').update(data).digest('hex') }]
  }))
}

if (require.main === module) {
  const directory = path.join(__dirname, '..')
  const actual = snapshot(directory)
  const file = path.join(directory, 'integrity.json')
  if (process.argv.includes('--write-snapshot')) fs.writeFileSync(file, JSON.stringify(actual, null, 2) + '\n')
  else if (JSON.stringify(actual) !== JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8'))))
    throw new Error('Data differs from the reviewed integrity snapshot; review changes before running npm run snapshot')
  console.log(JSON.stringify(actual, null, 2))
}

module.exports = { validateMap, snapshot }
