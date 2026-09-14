# #359 Staging readiness — 2026-09-15

Target: existing VP-V4 Staging database `dzqdzetcctkhbrhlxxgn`, Go2China organization.
The Supabase UI calls its primary branch “main Production”; this is the database
explicitly designated Staging by this repository's runtime configuration, not
permission to change an independent customer Production environment.

## Observed

User completed official GitHub→Supabase login in the browser. The signed-in console
now accesses the exact VP - V4 project. The separate Supabase connector remains
on a different account; browser login does not change connector identity.

Read-only SQL (`BEGIN READ ONLY`) observed 50 applied migrations, latest
`20260914090000`, `wiki_pages` absent, generation dispatcher absent, Ops disabled.
The migration list agrees. No migration, test identity or remote setting changed.
The dashboard listed the last scheduled backup as 21 hours old; this is not a
fresh pre-migration backup or restore proof.

## Exact proposed change

Apply only these three existing PR files, in order, to the named Staging target:

| Migration | SHA-256 |
| --- | --- |
| `20260914110000_vpj_75_359_wiki_schema.sql` | `d36d15528cd1ace7f13bfa19f5e665dbd427cb0eeab7945f0f1f0880cf9e827d` |
| `20260914120000_vpj_75_359_wiki_dispatcher.sql` | `6dd342fb3d396816cb0712ee21d7ac0a9bbce27ec05200a2917393d9e1d27f38` |
| `20260914130000_vpj_75_wiki_draft_content.sql` | `7e786cecdb30b239d8ea1c343a9c33bef27dda2e58c426d002997526799a38e0` |

This takes the target migration count from50 to53. The separately pending
`20260914100000_vpj_19_363_place_identity.sql` is NOT a Wiki dependency and is not
included. Do not run a blanket push that includes the map migration.

Pre-execution conditions: named-target authorization, secure database access for
fresh encrypted backup, successful isolated restore of that backup, schema/data
and effective-grant baseline, no active conflicting operator work. Do not obtain
secrets through chat, extract browser session stores, reset credentials or reuse a
stale backup as proof. Use migration tooling/history with exactly the approved set.

Local rehearsal on PostgreSQL17.6 starts at the actual pre-Wiki baseline, preserves
an existing synthetic source row byte-for-byte and applies all three changes in one
transaction before rolling back. Wiki table absence and original source data are
verified after rollback. Then the complete migration history and the eight existing
persistence/restart/receipt-fault/concurrency/ACL cases pass with zero skips.
Command and log: see `tests/integration/knowledge/wiki-draft.test.mjs` and
`/tmp/vpv4-wiki-staging-rehearsal.log`. Auth and provider here remain fixtures.

After authorization and backup proof: apply the bounded migration set; compare
original data/schema and effective ACLs; check anonymous/ordinary denial before
opening a bounded Ops test window. Use owned synthetic identities and retained
operation IDs. Temporarily enable only existing Ops controls needed for read/complete;
keep publication disabled, preserve all production protection and restore switches
and membership after verification. Never mark the parent complete from this slice.

New paid calls still need an available secure provider credential and a frozen
input/call/token/concurrency/timeout/fee cap; none is granted by browser login.
Real model, GoTrue consumer, Staging completion/restart and target restore remain
UNRUN until actually observed. Applied migrations receive forward-compatible repair;
retain body records, receipt history, original data and backups.

## Native CI parity on this device

Exact runtime commit `3fb381f3670298609ab9aebd82aab970fa219ee0` passed the unchanged
`scripts/ios/ci.py` command on pinned Xcode26.6/17F113, iOS26.5/23F77 and an owned
fresh iPhone17Pro simulator. Unsigned build, ad-hoc test build/signature validation,
boot, test and owned-simulator cleanup all exited0. `xcresulttool` summary:
80 total,57 passed,0 failed,23 explicit environment skips. This is not complete
GoTrue/remote/physical/VoiceOver/Store acceptance, and is not a forged GitHub check.

Local evidence: `/tmp/vpv4-pr397-native-full-20260915/commands.jsonl`,
`environment.json`, `tests.log`, and `tests.xcresult`; retained on this device.
The repo checkout remained on the exact tested runtime with only a new SQL rehearsal
test and documentation changed afterward. The hosted Native job still needs its
self-hosted runner; no trigger or required check was removed.
