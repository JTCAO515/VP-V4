# IOS-004 address authority implementation

Scope: original confirmed Trip JSON, original Proposal/diff/Confirm, exact version/day/item. No new Trip authority, relational column, permission grant, provider query, deployment or production action.

Initial stable source predecessors: `1b88fa297777c45eeb83afb689eb1855784e5e40`, `b0348d752c19492c98beeadd80ca0544a4174f36`.

## Implemented

- Optional user address text has writer-fixed `user_provided/unverified` tags, exact shared scalar/UTF8 validation, explicit null clear and old-upsert preservation. Address-only diff includes exact before/after; original rollback restores it. Same-item cross-day moves retain the exact original address in both draft/TS and original SQL producers; new items never copy the source address and replacement retains its own value.
- The existing confirmed version snapshot stores address data atomically. The canonical current snapshot overlays only the same owner/head/day/item from that original authority; old absent data is not rewritten. Original confirm function and its digest, locks, receipt and ACL are unchanged.
- Cookie endpoint: `/api/trips/{tripId}/addresses?expectedTripVersion=N&dayId=D&itemId=I`. Authoritative Trip scope before and after the ordinary ItemSupport RPC, then actor recheck. User and existing grounded references remain distinct. Existing ItemSupport EXECUTE is disabled in the accepted schema; its errors produce reference unavailable while preserving an independently read confirmed manual value. No grant is added.
- Model prompt and SQL destination equality omit only the new item field. Original request identity/digest uses the same omitted payload. Existing offline date/title permit is unchanged and rejects the online shape.
- Original export projection and lifecycle decoder preserve exact valid manual data, reject forged verification/unknown keys. The archive-data strict decoder has the same exact optional-field validation; unrelated keys and original export fences remain closed.
- New seed `20261015161024` checks accepted source and complete existing runtime/metadata before replacing functions. Runtime guard changes only five existing entries' ten source/definition pins; inventory and all metadata checks are preserved.

## Actual checks

- PASS: affected Trip/scoped-edit/offline/address/shared-value/service-task contracts 168/168, zero skips.
- PASS: TypeScript without incremental cache, source-policy lint, and diff whitespace check on the final product source. Existing core-export contracts17/17 and archive-data contracts6/6 also pass.
- PASS: owned PostgreSQL17 chronological full migration replay; original ordinary-role Proposal/Confirm, draft untouched, exact snapshot, distinct actor rejection, stale version, replay/unknown ACK, legacy upsert, clear and rollback.
- PASS: actual Cookie and Native Bearer SDK adapters over intercepted synthetic Auth/REST transport to owned PG read the same confirmed version/address. This is not managed GoTrue, PostgREST, a deployed Native API or device evidence.
- PASS: original export projection includes manual text; malformed address values fail closed; old snapshot rows remain unchanged; known-source drift is rejected and migration transaction rollback restores the accepted schema.
- PASS: eight existing supported-layout/runtime guards remain true after the new seed. Mechanical comparison proves the guard body differs only by ten authored hashes and the original confirmation writer remains byte-identical. SQL and shared text codec boundary/control/blank vectors match.
- PASS: original linked deletion SQL-claims lifecycle removes address snapshots and replays its receipt. Its accepted ordinary/worker EXECUTE remains disabled; this is not activation evidence.
- PASS: actual init failure, actual successful startup followed by injected failure, connection failure, connection-end failure, data-directory replacement and parent replacement. Replacement sentinels survive refused cleanup; restored original inodes can be cleaned. Each test owns private 0700 root/socket/data, no TCP and no shared resource pointer.

## Reproduce

Use existing read-only dependencies and caller-supplied PG17:

```sh
IOS004_NATIVE_PG=1 VP_WIKI_PG_BIN=/path/to/pg17/bin VP_WIKI_PG_MODULE=/path/to/pg/lib/index.js node --test tests/integration/ios004-user-address/postgres.test.mjs
```

The new test is default gated. Main owns its addition to the existing `postgres-native-17` CI lane with `IOS004_NATIVE_PG=1`, concurrency1, timeout180s. Existing Wiki binary/module variables are reused. No dependencies are installed. Generated source comparison files stay local/ignored.

## Limits

Target deployment, real Auth/provider qualification, physical device, release and complete #506 acceptance are UNRUN here. Existing current references still require current ordinary eligibility; fixtures never grant it. Main owns UI integration, CI and merge. No source activation, persistent role change, fee or external model request occurred. Local transactional privilege-drift negatives are rolled back. Full CI and existing Docker-gated suites are left to Main; this owner did not start Docker or borrow a Simulator.

## Final source delivery

- `868347c5228939b5f81672b58708076bc6d62267`: persisted original-authority flow, read/error separation, model omission and owned-PG integration entry.
- `f833842343720a885aa1d2c4b9a639f51bb6bd13`: archive decoder compatibility.
- `0e53a8b25436eb6a1932b04fa96e9c4ab75fbc8e`: same-item TS/draft move preservation.
- `441e51dc210b2a678fcd5f6d5f9aa638f0c5020b`: corresponding SQL producers, five-entry guard qualification, codec/resource additions.

Latest actual PostgreSQL entry:1/1, zero skip,6.365s. This includes ordinary-role writes and real SQL lifecycle tests with synthetic local Auth/REST claims. The source-only/Docker-free fixture is not target activation evidence. Official chat listing confirms project `4f2191db-3e04-4042-94b5-ec94ff67b427`; effective model/tier remains UNKNOWN.
