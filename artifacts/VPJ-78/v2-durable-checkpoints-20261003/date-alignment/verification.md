# Cross-layer observation timestamp alignment

2026-10-03. Correction to private checkpoint1dc05a1013686837c85336d4febaaf38a7319958 after Main's independent review. Normal fetch/merge includes main f97ecc5d0461471d017111e8607a80f01b5ccbdd (#625), merge checkpoint027db8304a1cf118dd47436147ed99aa10bf01ed. Existing old verification/logs remain evidence for their exact original sources.

## Explicit decision

Frozen Ports c441e3b32830c9c2520818057bb4dc879fd49f5b describes planning-place/1 and freshness but promises no offset/microsecond syntax. Actual route tool emits Date.toISOString (Z+3digits). Shared v2 form: YYYY-MM-DDTHH:mm:ss[.1..3digits]Z; zero fractions allowed; real calendar plus00..23/00..59/00..59 time. Reject all offsets including+00:00,4..6fractions, invalid calendar,24:00 and leap seconds without truncating/rewriting inputs. Only additive unapplied40000 and owned adapter narrow their acceptance; upstream020000/03030000 stay unchanged.

## Cross-layer actual proof

PASS targeted PostgreSQL1/1,0skip; same15 observations through SQL save/current read, strict adapter and frozen worker parser. Positive Z0/1/2/3 fractions save/read completed; worker reaches preparation probe. Negative+00:00/+08:00/-04:00,4/6fractions,Feb30,24:00,leap second,expired,future,array all fail SQL save and both decoders; durable started stays. No claim/permit/place request is allowed during the completed worker probe; prepare deliberately returnsnull. Parser acceptance is not prepared/publication/execution success. Both outcome flags false; zero provider/result writes.

current-main.log.gz uses every actual migration in this current checkout (includes merged020000/03030000), with owned40000 rollback→apply. No SQL from Git objects is injected. before-main.log.gz preserves the earlier source boundary. Reproduce: VP_TURN_DB_TEST=1 node --experimental-strip-types --test --test-name-pattern='same UTC millisecond observation' tests/integration/turn/planning-v2-durable-checkpoints.test.mjs.

Worker test dependency is exact immutable0f49f4264b17a06930f2092f6339fa6442167821 source, Git blob90a63e1846d58ad3dc8038137d7e517d3018d411, compressed under tests/integration/turn/fixtures. Test verifies that Git blob before temporary import; only unchanged endpoint dependency import path is relocated, then temp source removed. No runtime worker file changed or permission enabled. Fixture after-hook removes its network-none PostgreSQL container.

PASS adapter contracts5/5,0skip; typecheck/lint/docs/JS syntax/diff. Old10 PG matrix is not falsely attributed to this new source; date change covered by the targeted15-case cross-layer test, without repeating unrelated broad lanes. Formal joint worker/CI/device/target/provider/user acceptance remains UNRUN. Main retains final registry ownership; export/locks/one-shot/API revokes/fences unchanged.

## SHA-256 fingerprints

- supabase/migrations/20261003040000_vpj78_v2_durable_checkpoints.sql: `3a8ff1dc288549ae7bb9a6ce72bd3d32771bfb8f8ba1ef28b7c7ded3e3622e01`
- lib/server/turn/planning-v2-checkpoint-test-ports.ts: `009e44072ade0e7a9bbca10e0572c761056249d44b3dc2ad2e153c693bbebdde`
- tests/integration/turn/planning-v2-durable-checkpoints.test.mjs: `24d8669ecaa6ce68a6af9d65163b89ae87b1cfa39e508d8895eb1e645ac34f55`
