import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, relative, dirname, join, sep } from 'node:path'

const roots = {
  '@shared': resolve('src/shared'),
  '@main': resolve('src/main'),
  '@renderer': resolve('src/renderer/src'),
}

const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.png', '.svg']

const ignore = [
  resolve('src/plugin-sdk'),
  resolve('src/shared/paraglide'),
  resolve('src/shared/data/regex/vendor'),
]

function ignored(p) {
  const a = resolve(p)
  return ignore.some((i) => a === i || a.startsWith(i + sep))
}

function walk(d, a = []) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (ignored(p)) continue
    if (e.isDirectory()) walk(p, a)
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) a.push(resolve(p))
  }
  return a
}

function resolveRel(file, spec) {
  const base = resolve(dirname(file), spec)
  const candidates = [base, ...exts.map((x) => base + x), ...exts.map((x) => join(base, 'index' + x))]
  return candidates.find((c) => existsSync(c))
}

const importRe = [
  /from\s*["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  /require\s*\(\s*["']([^"']+)["']\s*\)/g,
]

let violations = 0

for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8')
  for (const re of importRe) {
    let m
    while ((m = re.exec(text))) {
      const spec = m[1]
      if (!spec.startsWith('../')) continue

      const target = resolveRel(file, spec)
      if (!target) continue

      const srcRoot = Object.entries(roots).find(([, r]) => file.startsWith(r + sep))
      const targetRoot = Object.entries(roots).find(([, r]) => target === r || target.startsWith(r + sep))

      if (targetRoot && (!srcRoot || srcRoot[0] !== targetRoot[0])) {
        const relTarget = relative(dirname(file), target)
        const suggested = spec.replace(/^(?:\.\.\/)+/, targetRoot[0] + '/')
        console.log(
          `${relative('.', file)}: ${m[0].trim()} uses relative '${spec}' → should use '${suggested}' (resolves to ${relative('.', target)})`,
        )
        violations++
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} cross-root relative import(s) found. Use alias paths instead.`)
  process.exit(1)
}
