# Profile export source-bound checkpoints

2026-10-07 Asia/Shanghai. TS products and sole final WIRE fixed at
11cdbc2a1bdb29e3c3a4dfe6d45e68effa4cbfac on the specified Profile base
0f114f679b89553017a41d18f3fbd6444bf8259b. Profile base remains unmerged.
Initial checkpoint changed only owned profile-export directories;
no SQL migration was written in this worktree. Later original-owner release and
Main a7aabb granted exactly the export-worker.ts import/composition/receipt-guard.
The three additions are applied; the consumed candidate patch is removed.

PASS: `node --experimental-strip-types --test tests/integration/privacy/profile-export/producer.test.mjs`
10/10, zero skipped. Closed TS source decoder/producer, genuine sourceRows,
saved masks, pace/latest Undo, monotonic tuple, absent Profile/watermark, exact
dispatcher sections digest, bounded one-item receipt and original crypto roundtrip.
Mock domain and in-process dispatcher/crypto, not actual PostgreSQL/Auth/HTTP.
Earlier nine-test page-ledger prototype is superseded, not reused as final proof.

PASS: strict scoped TypeScript using the existing dependency installation from
ProfileData worktree (read-only binary/type roots): `tsc --noEmit --strict --target
es2022 --module esnext --moduleResolution bundler --allowImportingTsExtensions
--skipLibCheck --types node --typeRoots <ProfileDataWT>/node_modules/@types
lib/server/privacy/profile-export/contract.ts lib/server/privacy/profile-export/handler.ts`.
PASS original `node scripts/lint.mjs` (774 sources) and cached diff whitespace check.

PASS: `VP_TURN_DB_TEST=1 node --experimental-strip-types --test tests/integration/privacy/profile-export/canonical-postgres.test.mjs`
6/6, zero skipped, 1.778s. Actual independent network-none temporary PostgreSQL
17.6.1.159 container, preinstalled image, original notification_private.canonical
function loaded verbatim from current migration. Owned container removed in after
hook; no role/grant, service activation, target source or new Profile migration.
Tests compare actual SQL compact UTF8 string and SHA256 against exportCanonical
for supported original fields: supplementary/combining/control/escaping values,
all locales, time fractions, safe integer boundaries, four pace actions, absent
rows, preview/erase/progress metadata. This is canonical-helper evidence only.

Actual numeric-scale finding: original SQL canonical preserves JSON numeric `4.0`,
while TS parses/stringifies it as `4`. The fixture proves that verified integral
typed projection to bigint produces matching bytes. Sole SQL owner must verify
and normalize every known integral field, reject fractions/unsafe bounds before
conversion, and run actual source projection proof. Do not round arbitrary JSON
numbers or claim this test has implemented the production source reader.

UNRUN until SQL stable same-source integration: new provenance/default-deny/RLS,
ordered migration/rollback/catalog compatibility, registered original worker,
signed GoTrue/API/HTTP/download bytes, source-clear/edit/lease/account/session
concurrency and opaque/proven-copy qualification. Native generic source review
finds reuse; no Swift edit/device execution. Whole #239/ALL1/ALL2 remain Open.
Production/Staging grants, keys/config/Storage/provider expense/deployment,
real-user data and device/old-device acceptance are not authorized/run.

Prepared, UNRUN: own run-http.mjs/auth-http.test.mjs reuse the original isolated
GoTrue fixture launcher/Native credentials and configured D2 runner, then verify
actual owner attachment bytes and a controlled clear between real prepare and
consume. No historical SQL source override. Actual startup waits for stable
current SQL/registered worker and a Main-reviewed nonoverlapping port lease.
The same single Auth case also covers a fresh same-owner session/new ticket and
immutable original-admission proof; it rejects an old-session ticket. This keeps
original D2 owner download and worker-recovery authority distinct. UNRUN.
Dependencies installed offline from the existing lockfile; full pnpm typecheck
PASS. Syntax checks PASS; no Auth/HTTP success inferred from preparation.

PASS after worker registration: 19/19 zero skipped across original core-export,
core-export-worker-http, memory-export-d4 and entitlement-export contract files.
Full typecheck and source lint PASS. Original bounded/Memory/entitlement counts,
disabled/no-key transport and immutable original execution recovery retained.
These contract fixtures do not prove new SQL/Auth/source-race integration.
