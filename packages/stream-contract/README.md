# @scalpel/stream-contract

The shared contract for Scalpel Stream. Three parties use it:
- Scalpel, which builds and pushes gear snapshots;
- the `scalpel-stream-api` Worker, which stores and serves them;
- `@scalpel/stream-viewer`, which renders them for viewers.

- `schema.ts`: the display-ready `StreamSnapshot` and its item, mod and skill shapes, plus the size limits.
- `api.ts`: Worker request and response shapes, pairing codes, head records, the PubSub message, and route paths.
- `validate.ts`: `validateSnapshot()`, the single gate both Scalpel (before pushing) and the Worker (on receipt) run.

Item art must be served from `https://web.poecdn.com/`, the only image host the Twitch extension allowlists.

`fixtures/sample-snapshot.json` is a hand-authored character for tests and viewer stories. Regenerate it with:

```
npm run build-sample --prefix packages/stream-contract
```

In the Scalpel repo, consumers import the TypeScript source directly. The Worker repo consumes a packed tarball (`npm pack`), the same way `@scalpel/item-data` is shared.
