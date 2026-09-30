// Opt-in end-to-end check of the real pipeline: live poe.ninja -> normalize ->
// enrich -> validate -> PUT to a running scalpel-stream-api -> read back.
//
//   1. npm run db:migrate:local --prefix C:/www/scalpel-stream-api
//   2. npm run dev --prefix C:/www/scalpel-stream-api        (serves :8787)
//   3. SCALPEL_STREAM_E2E=http://127.0.0.1:8787 npx vitest run src/main/stream/pipeline.e2e.test.ts
//
// Optional: SCALPEL_STREAM_E2E_ACCOUNT (default aer0_#2690).
import { paths, StreamHeadSchema, validateSnapshot } from '@scalpel/stream-contract'
import data from '@shared/data/tiers/tiers-poe2.json'
import type { TierDataset } from '@shared/data/tiers/types'
import { describe, expect, it } from 'vitest'
import { createStreamClient } from './client'
import { enrichCharacter } from './enrich'
import { normalizeCharacter } from './normalize'
import { createPoeNinjaSource } from './sources/poe-ninja'

const api = process.env.SCALPEL_STREAM_E2E
const account = process.env.SCALPEL_STREAM_E2E_ACCOUNT ?? 'aer0_#2690'

describe.skipIf(!api)('stream pipeline (live)', () => {
  it('publishes a real streamer character end to end', async () => {
    const source = createPoeNinjaSource((url, init) =>
      fetch(url, { headers: { 'User-Agent': 'Scalpel-Stream-E2E' }, signal: init?.signal }),
    )
    const characters = await source.accountCharacters(account)
    const ref = characters.find((c) => c.isCurrent) ?? characters[0]
    expect(ref, `poe.ninja has no profile for ${account}`).toBeTruthy()
    const raw = await source.fetchCharacter(ref)

    const normalized = normalizeCharacter(raw, { now: new Date(), hideCharacterName: false })
    enrichCharacter(normalized, { tierData: data as unknown as TierDataset, uniquePrice: () => undefined })
    const check = validateSnapshot(normalized.snapshot)
    expect(check.ok, check.ok ? '' : check.issues.join('\n')).toBe(true)

    const client = createStreamClient(
      (url, init) => fetch(url, { method: init.method, headers: init.headers, body: init.body }),
      api,
    )
    const { profileId, publishToken } = await client.createProfile()
    const { version } = await client.putSnapshot(profileId, publishToken, normalized.snapshot)
    expect(version).toBe(1)

    // No Twitch link locally, so read the stored version straight back.
    const stored = await (await fetch(`${api}${paths.snapshotVersion(profileId, version)}`)).json()
    expect(stored.character.name).toBe(raw.name)
    expect(Object.keys(stored.equipment).length).toBeGreaterThan(5)
    const tiered = Object.values(stored.equipment as Record<string, { sections: { lines: { tier?: unknown }[] }[] }>)
      .flatMap((i) => i.sections.flatMap((s) => s.lines))
      .filter((l) => l.tier).length
    expect(tiered).toBeGreaterThan(0)

    const status = await client.getProfile(profileId, publishToken)
    expect(status.head?.version).toBe(1)
    expect(
      StreamHeadSchema.safeParse({ ...status.head, profileId, state: status.state, displayName: null }).success,
    ).toBe(true)
    console.log(
      `published ${raw.name} (${raw.class} ${raw.level}, ${raw.league}) as ${profileId} v${version}: ` +
        `${check.ok ? check.bytes : 0} bytes, ${tiered} tier badges, ${normalized.warnings.length} warnings`,
    )
    // SCALPEL_STREAM_E2E_KEEP=1 leaves the profile up for a look at /p/<profileId> in the viewer.
    if (process.env.SCALPEL_STREAM_E2E_KEEP) console.log(`kept: /p/${profileId}`)
    else await client.deleteProfile(profileId, publishToken)
  }, 60_000)
})
