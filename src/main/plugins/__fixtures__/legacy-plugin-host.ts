/**
 * Baseline for plugin compatibility tests: the plugin gates exactly as they shipped in
 * Scalpel 1.0.5 (upstream main ae42ad64), before plugin services, dependencies, and native
 * backends. Function bodies are verbatim copies of `src/shared/version-match.ts` and
 * `src/main/plugins/manifest-validator.ts` at that commit; only the exported names changed.
 *
 * In 1.0.5 the registry list and the registry install both gated on `versionMatches`, and an
 * installed plugin was never version-gated again at load time. Do not "fix" this file: it is the
 * reference the current host is compared against.
 */

function compareVersions(a: string, b: string): number {
  const [aMain, aPre = ''] = a.split('-')
  const [bMain, bPre = ''] = b.split('-')
  const aSegs = aMain.split('.').map(Number)
  const bSegs = bMain.split('.').map(Number)
  for (let i = 0; i < Math.max(aSegs.length, bSegs.length); i++) {
    const d = (aSegs[i] ?? 0) - (bSegs[i] ?? 0)
    if (d !== 0) return d
  }
  if (!aPre && bPre) return 1
  if (aPre && !bPre) return -1
  return aPre.localeCompare(bPre, 'en', { numeric: true })
}

/** 1.0.5 registry visibility and registry install gate for `scalpelMinVersion`. */
export function legacyVersionMatches(entry: string, current: string): boolean {
  const m = entry.match(/^(<=|>=|<|>|=)?(.+)$/)
  if (!m) return false
  const op = m[1] ?? '='
  const cmp = compareVersions(current, m[2].trim())
  if (op === '=') return cmp === 0
  if (op === '<') return cmp < 0
  if (op === '<=') return cmp <= 0
  if (op === '>') return cmp > 0
  return cmp >= 0
}

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{2,49}$/

function isString(v: unknown): v is string {
  return typeof v === 'string'
}

function isPoeVersionArray(v: unknown): v is (1 | 2)[] {
  return Array.isArray(v) && v.every((x) => x === 1 || x === 2)
}

/** 1.0.5 manifest validator, used for registry installs, unpacked installs, and startup loading. */
export function legacyValidateManifest(raw: unknown): { ok: true } | { ok: false; error: string } {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'manifest must be an object' }
  }
  const m = raw as Record<string, unknown>
  if (m.manifestVersion !== 1) {
    return {
      ok: false,
      error: `unsupported manifestVersion (expected 1, got ${String(m.manifestVersion)})`,
    }
  }
  for (const k of ['id', 'version', 'name', 'description', 'author', 'scalpelMinVersion']) {
    if (!isString(m[k]) || (m[k] as string).length === 0) {
      return { ok: false, error: `field "${k}" must be a non-empty string` }
    }
  }
  if (!PLUGIN_ID_PATTERN.test(m.id as string)) {
    return { ok: false, error: `id "${String(m.id)}" must match ${PLUGIN_ID_PATTERN}` }
  }
  if (m.poeVersions !== undefined && !isPoeVersionArray(m.poeVersions)) {
    return { ok: false, error: 'poeVersions must be (1 | 2)[] when present' }
  }
  if (m.homepage !== undefined && !isString(m.homepage)) {
    return { ok: false, error: 'homepage must be a string when present' }
  }
  if (m.tabIcon !== undefined && !isString(m.tabIcon)) {
    return { ok: false, error: 'tabIcon must be a string when present' }
  }
  if (m.iconUrl !== undefined && !isString(m.iconUrl)) {
    return { ok: false, error: 'iconUrl must be a string when present' }
  }
  return { ok: true }
}
