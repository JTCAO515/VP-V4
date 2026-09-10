# VPJ-05 server and Web local verification

Base `cbd9f87`. This is a real local same-Trip consumer and confirmation-integrity result, not remote activation or full #192 closeout.

## Result

The native v2 API and the Cookie-backed Web share the existing Trip UUID, Day/Item store and confirmed version. Pending intent and its opaque SHA256 digest come from one database row; its before image is the immutable base-version snapshot. Confirm compares the request digest inside the locked database transaction and preserves existing CAS/snapshot/event/audit atomicity. Reads capture one head and fetch its immutable snapshot, excluding newer event/audit rows. User hard locks and external-order status remain unknown.

The Web has a local-only structured Day/Item editor, visible before/after review and explicit confirm. A newer server version does not overwrite or rebase an edited draft; only explicit discard does. Five-language strings and RTL are retained. Default Web protocol remains compatible with pre-28 database interfaces and never calls v2 read/reject or the new receipt column without explicit activation. An upgraded database never accepts a legacy arbitrary digest.

## Actual runtime evidence

- Only the named disposable Supabase API 59821 / database `supabase_db_vp-native-session-replay-20260910` and Next API/Web 59931 were used. No default old instance, remote database, provider or real account was used.
- `same-trip.log`: **PASS / 0 skip**, ordinary synthetic Auth/JWT → native/Web APIs → real RLS/RPC. Native creation, Web revision, old-revision denial, concurrent same-key confirmation and lost-response retry, both-direction edits and five confirmed versions all passed. Same UUID/version/content survived reloading both clients.
- An actual metadata response at version 2 was delayed until a separate real Web confirmation committed version 3. The adapter still returned version-2 content and only version-2-or-earlier history/audits. No database response was replaced with fixture content.
- Stale proposal review used its version-3 base while current head was version 4; stale confirm could not modify the newer plan. A service-side fixture mutation of the exact read proposal's revision/patch was rejected by the ordinary confirm RPC with the old digest and left the head unchanged. That mutation is an adversarial setup, not a production consumer path.
- Raw ordinary cross-proposal receipt reuse (old and new fingerprints), forged receipt/event/audit, direct `applied` status, nonzero initial head and foreign-Trip pending insertion were rejected. Legitimate title, guarded reject, complete rollback and idempotent retries passed. Replaced mobile reads/raw replay were denied while the Web Cookie remained usable.
- Creation retry is bound to immutable version-zero title: replaying the original create after a cross-client rename returns the current Trip, while reusing the UUID with the new current title is rejected.
- Exact test-owned UUID cleanup was asserted. The separate shared browser/iOS consumer accounts are intentionally retained by the running local helper for root's handoff.

## Security counterexamples before the append-only fix

On the same disposable baseline 27, ordinary RPC confirmation of proposal A followed by proposal B with A's key/digest returned `already_applied / version 1` while B's actual head stayed 0. Ordinary clients could insert a fake version-999 receipt, foreign-Trip event/audit, foreign pending proposal, mark pending as applied and create a Trip at head 999 with a matching initial snapshot. Each probe used new synthetic IDs with exact cleanup.

Migration `20260910002858_vpj_05_confirm_intent_authority.sql` closes that surface: a proposal binding on receipts; database-side exact persistent fingerprint comparison under locks; ordinary receipt/event/audit writes revoked; lifecycle writes moved to a guarded rejection RPC; pending inserts require owning the Trip; ordinary Trip creation starts at zero. Old receipts/history are retained without guessed provenance. Audit metadata is explicitly unknown; it is not confirmation authority. Existing migration files and the migration-27 native guard are unchanged.

SQL SHA256: `0818eb4fd8666f5385d5995a8a95d41d1fa5c82220b02fb92522056a2c88f587`. Local authoring applied the file transactionally to the designated development database; migration-history count still reflects the original 27 during author iteration. Root independently completed a preserved-data 27→28 CLI replay in a separate instance: Trip/snapshots/legacy receipt fields remained identical, old unbound replay was rejected, and new same-key confirmation committed once. See `../upgrade-root/verification.json`.

## Checks and boundaries

Lint, TypeScript, docs, diff and production build passed. The build used matching product source files in `/tmp/vpj05-web-build` to keep 59931 and consumer data intact; see `build-source.json`. The first copy excluded a source directory named `artifacts` by mistake and failed type checking; anchoring the exclusion to root `/artifacts` resolved the copy problem without a product-code change.

Security: 99/99 pass, zero skip. E2E contract suite: 40/40 pass. Full integration: 29 pass, 0 fail, 12 skip — ten budget-specific environment cases and the two opt-in identity/same-Trip cases. Same-Trip was run separately with activation and zero skip; the aggregate is still INCOMPLETE. Legacy-protocol seam/draft/snapshot tests: 3/3 pass.

Broad unit/contract runs exposed an unmodified H01 fixture's wall-clock expiry after 2026-09-10T00:00Z: unit 88 pass/4 pairing failures; contract 197 pass/1 pairing failure. Root is fixing that in an independent maintenance task. These runs are not presented as passing. Initial feature test assertions were corrected to the existing rollback HTTP 201 response and the new explicit forbidden-object response; business rejection/apply assertions remain enforced.

Root owns real desktop/390×844/browser stale-draft evidence under `../browser-root/`; the iOS author owns its independent actual SwiftUI/API evidence. Those are separate from Node HTTP and controlled unit seams and must be integrated/reviewed on the final commit. No physical-device, remote, provider or paid action is claimed.
