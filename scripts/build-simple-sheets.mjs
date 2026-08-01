/**
 * Generate the simplified PoE1 act starter packs from
 * scripts/simple-sheet-reads.json. One compact webp card per zone, showing
 * the zone name and its distilled Zone Read tip from Cyclon's Definitiv
 * Guide (used with permission). Zones whose guide page has no read yet are
 * skipped.
 *
 * Output: cheat-sheet-prefabs/poe1-act-NN-simple/ with one card per zone
 * plus _name.txt, _poe.txt, _group.txt and _zones.json sidecars. Run
 * `npm run sync-prefabs` afterwards to refresh the generated pack data.
 *
 * Rerun after editing tips: node scripts/build-simple-sheets.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const READS_FILE = path.join(__dirname, 'simple-sheet-reads.json')
const PREFAB_DIR = path.join(__dirname, '..', 'cheat-sheet-prefabs')
const LAYOUT_DIR = path.join(__dirname, 'simple-sheet-layouts')

// Card layout constants (px).
const WIDTH = 1000
const PAD = 34
const NAME_SIZE = 30
const TIP_SIZE = 24
const TIP_LINE = 33
const NUM_COL = 52

const COLORS = {
  bg: '#12141c',
  num: '#5d6478',
  name: '#fbbf24',
  act: '#5d6478',
  tip: '#d2d5df',
  credit: '#565c6e',
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Greedy word-wrap sized by an average glyph-width estimate; Segoe UI at
 *  these sizes averages ~0.52em per glyph, padded a little for safety. */
function wrap(text, size, maxWidth) {
  const perChar = size * 0.54
  const maxChars = Math.floor(maxWidth / perChar)
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w
    if (cand.length > maxChars && line) {
      lines.push(line)
      line = w
    } else {
      line = cand
    }
  }
  if (line) lines.push(line)
  return lines
}

function renderCard(act, index, zone) {
  const textWidth = WIDTH - PAD * 2 - NUM_COL
  const tipLines = wrap(zone.tip, TIP_SIZE, textWidth)
  const height = 96 + tipLines.length * TIP_LINE + 44

  const parts = []
  parts.push(`<rect width="${WIDTH}" height="${height}" fill="${COLORS.bg}"/>`)
  let y = PAD + 30
  parts.push(`<text x="${PAD}" y="${y}" font-size="${NAME_SIZE}" fill="${COLORS.num}">${String(index).padStart(2, '0')}</text>`)
  parts.push(
    `<text x="${PAD + NUM_COL}" y="${y}" font-size="${NAME_SIZE}" font-weight="700" fill="${COLORS.name}">${esc(zone.name)}</text>`,
  )
  parts.push(`<text x="${WIDTH - PAD}" y="${y}" font-size="21" fill="${COLORS.act}" text-anchor="end">Act ${act}</text>`)
  y += 42
  for (const line of tipLines) {
    parts.push(`<text x="${PAD + NUM_COL}" y="${y}" font-size="${TIP_SIZE}" fill="${COLORS.tip}">${esc(line)}</text>`)
    y += TIP_LINE
  }
  parts.push(
    `<text x="${WIDTH - PAD}" y="${height - 18}" font-size="15" fill="${COLORS.credit}" text-anchor="end">Zone reads by CyclonDefinitiv - definitivguide.com</text>`,
  )

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" font-family="Segoe UI, Arial, sans-serif">${parts.join('')}</svg>`
  return { svg, height }
}

/** Write one zone card: the text strip alone (q90, byte-compatible with the
 *  previous cards), or strip + layout map stacked vertically (q82 - photo
 *  content) when the zone has a chosen layout image. */
async function writeZoneCard(act, index, zone, outFile) {
  const { svg, height: stripHeight } = renderCard(act, index, zone)
  const stripPng = await sharp(Buffer.from(svg)).png().toBuffer()
  const layoutPath = zone.layout
    ? path.join(LAYOUT_DIR, `act-${String(act).padStart(2, '0')}`, zone.layout)
    : null
  if (!layoutPath || !fs.existsSync(layoutPath)) {
    if (zone.layout) console.warn(`  act ${act} ${zone.name}: layout ${zone.layout} not found - text-only card`)
    await sharp(stripPng).webp({ quality: 90 }).toFile(outFile)
    return
  }
  const map = await sharp(layoutPath).resize({ width: WIDTH }).png().toBuffer()
  const mapHeight = (await sharp(map).metadata()).height
  await sharp({
    create: { width: WIDTH, height: stripHeight + mapHeight, channels: 3, background: COLORS.bg },
  })
    .composite([
      { input: stripPng, top: 0, left: 0 },
      { input: map, top: stripHeight, left: 0 },
    ])
    .webp({ quality: 82 })
    .toFile(outFile)
}

const kebab = (s) =>
  s
    .toLowerCase()
    .replace(/^the /, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

async function main() {
  const reads = JSON.parse(fs.readFileSync(READS_FILE, 'utf8'))
  for (const { act, zones } of reads.acts) {
    const dir = path.join(PREFAB_DIR, `poe1-act-${String(act).padStart(2, '0')}-simple`)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, '_name.txt'), `Act ${act}\n`)
    fs.writeFileSync(path.join(dir, '_poe.txt'), '1\n')
    fs.writeFileSync(path.join(dir, '_group.txt'), 'leveling-simple\n')

    const zonesJson = {}
    let index = 0
    for (const zone of zones) {
      if (!zone.tip) continue
      index++
      const name = `${String(index).padStart(2, '0')}-${kebab(zone.name)}.webp`
      await writeZoneCard(act, index, zone, path.join(dir, name))
      zonesJson[name] = zone.codes
    }
    const lines = Object.entries(zonesJson).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    fs.writeFileSync(path.join(dir, '_zones.json'), `{\n${lines.join(',\n')}\n}\n`)
    console.log(`act ${act}: ${index} zone cards`)
  }
}

main()
