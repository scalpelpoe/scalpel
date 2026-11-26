/** Game-window identity shared by every platform path that has to decide
 *  "is this really PoE?". Titles alone are not enough: Steam, Heroic and other
 *  launchers can open windows named exactly like the game. */
export type PlatformGameVariant = 1 | 2

export const PLATFORM_GAME_TITLES: Record<PlatformGameVariant, string> = {
  1: 'Path of Exile',
  2: 'Path of Exile 2',
}

export interface GameTitleOverrides {
  readonly poe1?: string | null
  readonly poe2?: string | null
}

export interface GameWindowIdentityHint {
  readonly appIds: readonly string[]
  readonly classNames: readonly string[]
  readonly instances: readonly string[]
}

interface GameTitleSpec extends GameWindowIdentityHint {
  readonly title: string
}

let titleSpecs: Record<PlatformGameVariant, GameTitleSpec | null> = { 1: null, 2: null }

const normalizeTitle = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''

/** Comparison key for window titles: trimmed, whitespace collapsed, lowercase. */
export const titleKey = (value: string | null | undefined): string => normalizeTitle(value).toLowerCase()

const alternatives = (value: string | undefined): readonly string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

/** One string per game: `Title|appId[,alt]|className|instance`. The title part
 *  stays compatible with native title-only attach; identity parts are optional
 *  hints for paths that can see app id/class/instance. */
function parseTitleSpec(value: string | null | undefined, variant: PlatformGameVariant): GameTitleSpec | null {
  const parts = normalizeTitle(value)
    .split('|')
    .map((part) => part.trim())
  const title = parts[0] || PLATFORM_GAME_TITLES[variant]
  const hint = {
    appIds: alternatives(parts[1]),
    classNames: alternatives(parts[2]),
    instances: alternatives(parts[3]),
  }
  if (
    title === PLATFORM_GAME_TITLES[variant] &&
    !hint.appIds.length &&
    !hint.classNames.length &&
    !hint.instances.length
  ) {
    return null
  }
  return { title, ...hint }
}

/** Host settings supply optional window identities. They are aliases, not
 *  replacements: canonical titles stay first so titleIndex 0/1 keeps meaning. */
export function setGameTitleOverrides(next: GameTitleOverrides = {}): void {
  titleSpecs = {
    1: parseTitleSpec(next.poe1, 1),
    2: parseTitleSpec(next.poe2, 2),
  }
}

export function resetGameTitleOverridesForTests(): void {
  setGameTitleOverrides()
}

function specFor(variant: PlatformGameVariant): GameTitleSpec | null {
  return titleSpecs[variant]
}

/** Identity hints from the configured string, keyed by canonical title slot. */
export function getGameIdentityHints(): Readonly<Record<PlatformGameVariant, GameWindowIdentityHint | null>> {
  const hintOf = (variant: PlatformGameVariant): GameWindowIdentityHint | null => {
    const spec = specFor(variant)
    return spec ? { appIds: spec.appIds, classNames: spec.classNames, instances: spec.instances } : null
  }
  return { 1: hintOf(1), 2: hintOf(2) }
}

export function getGameTitleForVariant(variant: PlatformGameVariant): string {
  return specFor(variant)?.title || PLATFORM_GAME_TITLES[variant]
}

export function getGameTitlesForVariant(variant: PlatformGameVariant): readonly string[] {
  const canonical = PLATFORM_GAME_TITLES[variant]
  const override = specFor(variant)?.title
  return override && titleKey(override) !== titleKey(canonical) ? [canonical, override] : [canonical]
}

/** Canonical slots stay at 0/1 for the two variants; aliases follow them. */
export function getAllGameTitles(): readonly string[] {
  const titles: string[] = [PLATFORM_GAME_TITLES[1], PLATFORM_GAME_TITLES[2]]
  for (const variant of [1, 2] as const) {
    const override = specFor(variant)?.title
    if (override && !titles.some((title) => titleKey(title) === titleKey(override))) titles.push(override)
  }
  return titles
}

export interface GameWindowIdentity {
  readonly title?: string | null
  readonly appId?: string | null
  readonly className?: string | null
  readonly instance?: string | null
  readonly shell?: string | null
}

export interface GameWindowMatch {
  readonly accepted: boolean
  readonly variant: PlatformGameVariant | null
  readonly score: number
  readonly reason: string
}

const reject = (reason: string): GameWindowMatch => ({ accepted: false, variant: null, score: 0, reason })

const compact = (value: string | null | undefined): string => (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Launcher/client identities that must never own the game overlay. Checked
 *  separately from the executable name: `pathofexilesteam.exe` is the game. */
const LAUNCHER_IDENTITY_RE =
  /(?:steam|epicgames|heroic|gog|galaxy|battlenet|ubisoftconnect|xboxapp|launcher|webhelper|browser|chromium|firefox|discord|obs)/i

/** Wrapper processes that legitimately own a game window without a PoE app id. */
const WRAPPER_IDENTITY_RE = /(?:wine|proton|lutris|bottles|flatpak|appimage|umu)/i

/** Words that mean a window is about the game, not the game itself. Launcher
 *  names are deliberately not here: a game launched by Steam/Heroic/GOG can
 *  legally carry that launcher's name in its title. */
const UTILITY_TITLE_RE =
  /(?:wiki|trade|forum|news|updater|installer|library|store|shop|friends|chat|browser|overlay|launcher|compendium)/i

function titleVariant(value: string | null | undefined): PlatformGameVariant | null {
  const title = titleKey(value?.replace(/_/g, ' '))
  if (!title) return null
  // A suffix after a separator is allowed: "Path of Exile 2 (GOG)", "PoE - Standard".
  if (/^(?:path ?of ?exile ?2|path ?of ?exile ?ii|poe ?2|poe2|pathofexile2)(?:$|[^a-z0-9])/.test(title)) return 2
  if (/^(?:path ?of ?exile|poe ?1|poe|pathofexile)(?:$|[^a-z0-9])/.test(title)) return 1
  return null
}

interface AppVariant {
  /** `null` means the identity is PoE-related but does not name a variant. */
  readonly variant: PlatformGameVariant | null
  /** 4 = game-specific executable, 2 = shared game id, 1 = generic PoE id. */
  readonly strength: 4 | 2 | 1
  /** Steam game ids are strong, but an unrelated Steam game must not qualify. */
  readonly requiresTitle?: boolean
}

function appVariant(value: string | null | undefined): AppVariant | null {
  if (!value) return null
  const app = compact(value)
  if (/pathofexile2|poe2|pathofexileii/.test(app)) return { variant: 2, strength: 4 }
  // Steam's `pathofexilesteam.exe` is shared by PoE1 and PoE2. It proves the
  // window is the game, but only the window title can say which variant.
  if (/pathofexilesteam/.test(app)) return { variant: null, strength: 4, requiresTitle: true }
  if (/pathofexile1|poe1/.test(app)) return { variant: 1, strength: 4 }
  // Native Steam games expose `steam_app_<id>`. This is the game process, not
  // the Steam client; the title decides which PoE variant it is.
  if (/^steamapp\d+$/.test(app)) return { variant: null, strength: 4, requiresTitle: true }
  // Bare `pathofexile-exe` is used by both PoE1 and PoE2 native Wayland builds.
  // It proves the window is the game, but the title must decide the variant.
  if (/^(?:pathofexile|pathofexileexe)$/.test(app)) return { variant: null, strength: 2 }
  // Generic ids used by wrapper launches identify PoE, not a specific game.
  if (/^(?:com)?poe(?:game|client)?$/.test(app)) return { variant: null, strength: 1 }
  return null
}

function strongestApp(apps: readonly AppVariant[]): AppVariant | null {
  return apps.reduce<AppVariant | null>((best, entry) => (!best || entry.strength > best.strength ? entry : best), null)
}

function identityScore(app: AppVariant | null, hasTitleVariant: boolean): number {
  if (!app) return hasTitleVariant ? 3 : 0
  if (app.strength === 4) return hasTitleVariant ? 5 : 4
  if (app.strength === 2) return hasTitleVariant ? 4 : 2
  return hasTitleVariant ? 3 : 1
}

/** Canonical titles come from the host, but a profile may pass custom titles.
 *  Unknown titles leave both variants open; strong app ids still disambiguate. */
export function expectedGameVariants(titles: readonly string[]): readonly PlatformGameVariant[] {
  const variants = new Set<PlatformGameVariant>()
  for (const title of titles) {
    const variant = titleVariant(title)
    if (variant) variants.add(variant)
  }
  return variants.size ? [...variants] : [1, 2]
}

/** Profiles may override the window title. An exact configured title is a valid
 *  game signal even when it cannot be classified as PoE1 or PoE2 by name. */
export function matchesExpectedTitle(title: string | null | undefined, titles: readonly string[]): boolean {
  const value = titleKey(title)
  return value !== '' && titles.some((expected) => titleKey(expected) === value)
}

function hintedSpecForTitle(title: string | null): GameTitleSpec | null {
  if (!title) return null
  const value = titleKey(title)
  for (const variant of [1, 2] as const) {
    const spec = specFor(variant)
    if (spec && titleKey(spec.title) === value) return spec
  }
  return null
}

function matchesIdentityHint(hint: GameWindowIdentityHint, candidate: GameWindowIdentity): boolean {
  const any = (values: readonly string[], actual: string | null | undefined): boolean =>
    values.some((value) => compact(value) === compact(actual))
  return (
    any(hint.appIds, candidate.appId) ||
    any(hint.classNames, candidate.className) ||
    any(hint.instances, candidate.instance)
  )
}

/**
 * Accepts a window only when it looks like PoE, is not a launcher/utility
 * window, and (when the host requested a specific game) is the right variant.
 */
export function matchGameWindow(candidate: GameWindowIdentity, titles: readonly string[]): GameWindowMatch {
  const title = candidate.title ?? null
  const titleVariantFound = titleVariant(title)
  const expected = expectedGameVariants(titles)
  const titleIsExpected = Boolean(titleVariantFound) || matchesExpectedTitle(title, titles)
  const apps = [candidate.appId, candidate.className, candidate.instance]
    .map(appVariant)
    .filter(Boolean) as AppVariant[]
  const app = strongestApp(apps)
  // A game-specific executable outranks a loose title. Shared and generic PoE
  // ids do not name a variant, so the window title decides PoE1 vs PoE2.
  const variant = app?.variant ?? titleVariantFound

  if (title && UTILITY_TITLE_RE.test(title)) return reject('utility-title')
  const identity = [candidate.appId, candidate.className, candidate.instance].filter(Boolean).join(' ')
  if (app?.strength !== 4 && identity && LAUNCHER_IDENTITY_RE.test(identity)) return reject('launcher-window')
  // A configured identity hint is authoritative when the candidate exposes any
  // identity fields. Title-only sources cannot enforce it and keep the older
  // title-based behavior (documented in the settings UI).
  const hint = hintedSpecForTitle(title)
  if (hint && identity && !matchesIdentityHint(hint, candidate)) return reject('identity-hint-mismatch')
  // A title-only match is trustworthy when no app id exists or the app id is a
  // known wrapper. An unrelated app id plus a borrowed title is a false positive.
  if (!app && titleVariantFound && identity && !WRAPPER_IDENTITY_RE.test(identity)) {
    return reject('unrelated-app-id')
  }
  if (app?.requiresTitle && !titleIsExpected) return reject('no-game-signal')

  if (variant) {
    if (!expected.includes(variant)) return reject('variant-mismatch')
    return { accepted: true, variant, score: identityScore(app, Boolean(titleVariantFound)), reason: 'game' }
  }
  if (app) {
    return { accepted: true, variant: null, score: identityScore(app, false), reason: 'game' }
  }

  if (matchesExpectedTitle(title, titles)) return { accepted: true, variant: null, score: 3, reason: 'expected-title' }
  return reject('no-game-signal')
}
