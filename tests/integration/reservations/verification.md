# #214 SQL ledger verification

Owned runtime: `supabase/migrations/20261004020000_reservation_ledger.sql`.
Closed wire: `docs/contracts/vpj24-reservation-ledger.md` (Main approved `09c9f011`).
Early runnable delivery `550ca6392f857536e5d59acbd8f3cf016e4dfe08` was handed to TS before full PG verification. Final delta only fixes typed integer casts and JS-compatible text bounds/whitespace; original text/source/timestamp strings remain unchanged. No old migration, TS/Swift or shared registry changed.

Actual local PostgreSQL 17, cached Supabase image, disposable `vpj24-reservations-*` containers, network none, Unix socket only. Original application migrations/actor/current Trip/archive/D1/D3/D2 functions loaded. Admin-created synthetic auth.users/auth.sessions and JWT claims; no signed GoTrue/Auth, target grant, deployment, real owner data, supplier/model or device acceptance. Containers removed by test teardown.

| Run | Source / result |
| --- | --- |
| First behavior, initial runtime | 1 PASS, 0 FAIL, 0 skip; confirm/opread/replay/CAS/amend/cancel/no Trip mutation |
| First behavior after source-inspected UUID casing/typed canonicalization | 1 PASS, 0 FAIL, 0 skip; no prior observed UUID failure |
| Full owned eight behavior cases, early runtime550ca639 | 8 PASS, 0 FAIL, 0 skip |
| Added existing closed-input assertion for JSON numeric0.0 | 1 FAIL: bigint text cast `0.0`; existing assertions retained |
| Numeric cast repair, failed case only | 1 PASS, 0 FAIL, 0 skip |
| Added TS text-bound assertions (81 emoji / NBSP-only title) | 1 FAIL: SQL accepted input contrary to closed contract; assertions retained |
| UTF16/JS-whitespace repair, affected closed/identity/ACL cases only | 3 PASS, 0 FAIL, 0 skip |
| Final same raw0.0-command replay + operation read assertions | 1 PASS, 0 FAIL, 0 skip |

Full run: `VP_TURN_DB_TEST=1 node --test tests/integration/reservations/ledger-postgres.test.mjs`.
Affected repair run: `VP_TURN_DB_TEST=1 node --test --test-name-pattern='closed validation|server identity|private exact D2' tests/integration/reservations/ledger-postgres.test.mjs`.
Final numeric assertions: `VP_TURN_DB_TEST=1 node --test --test-name-pattern='closed validation' tests/integration/reservations/ledger-postgres.test.mjs`.
`node --check tests/integration/reservations/ledger-postgres.test.mjs`, `node scripts/docs-check.mjs`, `git diff --check`: PASS.

Eight cases prove exact original operation ACK/echo/digest binding, CAS and superseded recovery; unavailable artifacts and closed inputs; own-current list/single/current-head/cursor; owner/Trip/supplier and full-field dedup with equivalent UTC instants; two actual concurrent transactions and one winner; late op insertion rollback and immutable metadata; original archive/D1/D3/account cleanup with financial minimum retained; private exact D2 job/lease/generation/current-only metadata and all new function/table default ACL negatives. New RLS tables have no direct role grants. Historical fields/source/command/receipt bodies are absent. The D2 seam remains unenrolled, inventory partial. Existing D2 inventory and prior export privileges remain unchanged.

Same-source evidence is reused: the final helper/cast delta reruns its affected cases, not the unchanged lifecycle/transaction matrix. Target migration/grants, real signed Auth, real owner deletion/export, source/provider verification, local-material withdrawal authority, Native/Web human/device acceptance: UNRUN. No whole #214 closure or separate preparation PR is claimed.
