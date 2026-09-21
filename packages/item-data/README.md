# @scalpel/item-data

Versioned, offline indexes mapping English item names to artwork URLs for Path
of Exile 1 and 2. Images remain on GGG's `web.poecdn.com`; no image files or live
manifest service are shipped. This package has no runtime dependencies or code.

The canonical source is `packages/item-data` in `scalpelpoe/scalpel`. Edit the
maps here only. Scalpel and PoB Redux consume the same immutable package release.
The initial package name is provisional: npm scope ownership has not been
verified and this preparation does not publish anything.

## Consumption

The public exports are `@scalpel/item-data/poe1.json` and
`@scalpel/item-data/poe2.json`. Values are URLs, keyed by exact English item names.
Do not derive names from CDN filenames, decode/rewrite URLs, or replace unique
art with base-type art. There is no root export that eagerly loads both games.

```ts
// Vite/bundler consumers can load only the selected game.
const icons = game === 1
  ? (await import('@scalpel/item-data/poe1.json')).default
  : (await import('@scalpel/item-data/poe2.json')).default
```

Static JSON imports and CommonJS `require('@scalpel/item-data/poe1.json')` also
work. Native Node ESM needs the JSON import attribute appropriate to its Node
version. Consumers using TypeScript should enable `resolveJsonModule`.

For the initial unpublished release, copy `vendor/scalpel-item-data-0.1.0.tgz`
into the consuming repository's `vendor/` directory, then run:

```sh
npm install --save-exact ./vendor/scalpel-item-data-0.1.0.tgz
```

Commit the tarball, `package.json` and lockfile. This needs no sibling checkout
and pins the reviewed bytes through lockfile integrity. Once an authorized
registry or immutable release asset exists, pin that exact version/artifact
instead; do not use `latest`, a branch URL, a range, or a machine-local path.

## Data provenance and maintenance

The 0.1.0 maps were moved byte-for-byte from Scalpel commit
`f24f5895` (`src/shared/data/items/item-icons-poe{1,2}.json`): 5,041 PoE1 and
1,941 PoE2 entries. `integrity.json` records full-file SHA-256 and counts.
Existing URL strings, aliases, and coverage are preserved.

PoE1's existing gap-filling script uses GGG trade static data first, then pinned
GGG trade-fetch icons and RePoE base-item visual identities. It only adds
currently tradeable names, never overwrites existing keys, excludes unique-name
joins to base art, and verifies candidate URLs before writing. Run from this
directory:

```sh
npm run sync:poe1 -- --dry-run
npm run sync:poe1
```

PoE2 had no dedicated sync script in Scalpel. Its history contains curated
additions/renames (including RotA commit `9b78c12c`, The Taming `02103684`, and
related-item coverage `874daa5d`). Some historical revisions used RePoE-hosted
art; the extracted current map uses only GGG CDN URLs. Preserve that current
behavior. Do not apply the PoE1 RePoE join to PoE2.

For new PoE2 entries, save a GGG trade-fetch response for known matching items
and run the importer below. It uses `item.name` for uniques and `item.baseType`
otherwise, refuses conflicting candidate art, keeps existing mappings, checks
GGG URL ownership and verifies URLs before writing. It does not query the trade
API or require credentials. Keep input captures outside the repository; do not
commit account/listing metadata. Record evidence for the selected item names
and URLs in the data review.

```sh
npm run sync:poe2 -- --input /path/to/trade-fetch.json --dry-run
npm run sync:poe2 -- --input /path/to/trade-fetch.json
```

Neither importer automatically removes or renames items or corrects existing
art. Review those edits explicitly against GGG evidence, preserving legitimate
aliases. Update the retired/replacement regression assertions when appropriate.
Do not overwrite the canonical map with an unreviewed runtime cache: an
incorrect unique/base association would affect both apps.

## Review and release

1. Run sync in dry-run mode, inspect the candidate name/URL pairs, then apply.
   Review added, changed and removed names and representative rendered images.
2. Review any coverage reduction or URL change. Run `npm run snapshot` only
   after accepting that diff; it updates the explicit count/hash baseline.
3. Run `npm run validate` and `npm test`. Checks are offline and cover schema,
   duplicate keys, CDN URLs, coverage hashes, identity rules and PoE2 renames.
   They do not claim that every existing URL is currently reachable.
4. Bump `version` in this package's `package.json`: patch for data corrections
   and additions, major for incompatible export/lookup changes. Never replace
   the bytes of an already distributed version.
5. From the repository root, run
   `npm pack ./packages/item-data --pack-destination ./vendor`.
   The prepack hook validates data and runs tests; only data, schema, integrity,
   README and license enter the tarball. Review `npm pack --dry-run` output and
   record the tarball SHA-256. The scripts and tests remain in canonical source.
6. Obtain authorization and verify namespace/repository access before publishing
   to npm or uploading a release asset. No publication is part of these scripts.
   Publish an immutable artifact from the reviewed source commit/tag and record
   its version, source commit, URL and checksum in release notes.
7. Update both applications' exact dependency and lockfile. Run their affected
   tests/builds and check hover/overlay art. Scalpel's `sync-icons` edits canonical
   source only; consumers change only after repacking and updating dependencies.

Scalpel bundles the JSON into its main and renderer builds. Its trade-response
runtime cache remains local to the app and follows the same precedence as before.
PoB Redux can use separate dynamic JSON imports to retain lazy game loading.

The extracted code/data retain Scalpel's AGPL-3.0-only license; see LICENSE.
GGG owns the referenced artwork. This package conveys no additional rights to it.
