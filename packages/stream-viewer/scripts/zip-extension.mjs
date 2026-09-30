// Packs dist/extension into the zip the Twitch developer console takes, pages at the zip root.
// Windows PowerShell 5.1's Compress-Archive writes backslash entry names, which break the
// assets/ folder once Twitch unpacks it, so the zip is written here with forward slashes.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateRawSync } from 'node:zlib'

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(pkg, 'dist', 'extension')
const out = join(pkg, 'dist', 'scalpel-stream-extension.zip')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const files = walk(root)
  .map((path) => ({ path, name: relative(root, path).split(sep).join('/') }))
  .sort((a, b) => a.name.localeCompare(b.name))
if (!files.some((f) => f.name === 'video_overlay.html')) {
  throw new Error(`No extension build in ${root}; run npm run build:extension first.`)
}

// Fixed 1980-01-01 timestamp so the same build always zips to the same bytes.
const DOS_TIME = 0
const DOS_DATE = (1 << 5) | 1
const UTF8_NAMES = 0x0800

const locals = []
const centrals = []
let offset = 0
for (const { path, name } of files) {
  const data = readFileSync(path)
  const packed = deflateRawSync(data, { level: 9 })
  const nameBytes = Buffer.from(name, 'utf8')
  const crc = crc32(data)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(UTF8_NAMES, 6)
  local.writeUInt16LE(8, 8)
  local.writeUInt16LE(DOS_TIME, 10)
  local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(packed.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBytes.length, 26)
  locals.push(local, nameBytes, packed)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(UTF8_NAMES, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt16LE(DOS_TIME, 12)
  central.writeUInt16LE(DOS_DATE, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(packed.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBytes.length, 28)
  central.writeUInt32LE(offset, 42)
  centrals.push(central, nameBytes)

  offset += local.length + nameBytes.length + packed.length
}

const directory = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(directory.length, 12)
end.writeUInt32LE(offset, 16)

writeFileSync(out, Buffer.concat([...locals, directory, end]))
console.log(`${relative(pkg, out)}: ${files.length} files`)
