/** Schema of a single plugin entry in the curated registry. Mirrors the
 *  manifest fields the user needs to see before they decide to install,
 *  plus the GitHub-release coordinates required to actually download the
 *  plugin's files.
 *
 *  Intentionally duplicates a subset of PluginManifest fields. The registry
 *  entry is the user-facing "store row" and shouldn't depend on the SDK's
 *  manifest type (which lives in src/plugin-sdk/). Keep this and PluginManifest
 *  in sync manually when changing shared fields. */
export interface RegistryEntry {
  /** Plugin id; must match the manifest id on disk. Same regex as the
   *  manifest validator: ^[a-z][a-z0-9-]{2,49}$. */
  id: string
  /** Display name for the store row. */
  name: string
  /** GitHub username (or org) shown next to the name. */
  author: string
  /** One- or two-line description shown in the browse list. */
  description: string
  /** "<owner>/<repo>" on GitHub. Used to construct the release download URL. */
  repo: string
  /** Latest published plugin version; matched against the installed plugin's
   *  manifest.version. Used as the GitHub release tag in the form "v<version>". */
  latestVersion: string
  /** Lowercase hex SHA-256 of the released plugin.js. The curated registry is
   *  the trust root; this pins the exact bytes so a later compromise or swap
   *  of the GitHub release asset is rejected at install time. */
  sha256: string
  /** Additional release assets pinned by the curated registry, keyed by their
   *  safe root-level filename. Native executables must appear here. */
  assets?: Record<string, string>
  /** Comparator expression a la versionMatches; install is blocked if the
   *  running Scalpel doesn't satisfy this. */
  scalpelMinVersion: string
  /** Empty/omitted means both. */
  poeVersions?: (1 | 2)[]
  /** Optional absolute URL (usually a raw.githubusercontent path) to a small
   *  icon shown in the row. PNG or SVG. Plain string; no validation beyond
   *  "looks like a URL" at render time. */
  iconUrl?: string
  /** Optional homepage shown as a "Repo" link in the expanded row. */
  homepage?: string
  /** Optional absolute image URLs shown in the expand-in-place gallery.
   *  Bare strings, no captions. Omitted/empty means the row has no gallery. */
  screenshots?: string[]
  /** When true the plugin is promoted into the "Featured Plugins" section of
   *  onboarding's Plugins step. Onboarding only: Settings > Plugins lists every
   *  plugin flat and does not surface this flag. Ordering within the featured
   *  group follows registry array order. Absent means not featured.
   *
   *  Optional and additive on purpose: no schemaVersion bump is needed, older
   *  app builds ignore it, and a self-hosted registry that omits it simply
   *  renders no featured section. */
  featured?: boolean
}

export interface RegistrySnapshot {
  /** Bumped when the registry schema changes in an incompatible way. v1 is
   *  the only supported value at the moment. */
  schemaVersion: 1
  plugins: RegistryEntry[]
}
