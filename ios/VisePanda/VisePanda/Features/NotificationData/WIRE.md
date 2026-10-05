# #239 ALL1 notification data Native owner

Sole Native writer: `vpj58-native-notification-data-20261006`.
Fixed clean material integration base: `f1f065c8c6e79c6c0c380d3cd961939e1e57ba01`.
Only this new Features/NotificationData directory and unique new tests are writable.
Original dirty checkout is excluded. No SQL, shared old notification worker, Session,
coverage, PBX, registry, target activation, real user data or external messages.

Actual initial product source: Lifetime (current actor/session/epoch/foreground
generation + original request-start 30s TTL), Journal (separate credential-vault
service preserving exact validated erase bytes through unknown ACK), ExportFile
(existing protected writer in separate owned root, exact bytes readback + TTL).
Commands, DTO fields and receipt parsing will consume only the sole TS owner's
closed notification-data wire. This storage groundwork does not invent one.
No discovered test/build/target PASS claim.

Main precise lease proposal, no shared write yet:
- NativeSession: dedicated notificationDataRequest using existing actor, mobile
  epoch/reauth and guarded request fences; per-scope store factory; logout/epoch
  cleanup of this journal and private export root only.
- DataCoverage: exact notifications handler destination and scoped completion
  from validated receipt/file; new declared state inventory, no all-data claim.
- PBX: new source files and sole NativeNotificationDataTests membership.
- Existing Notifications: only producer-reviewed selected erase invalidation if
  required; existing reminder business, provider eligibility and roots unchanged.

Need producer wire with explicit selections/scopes, full field/retention/external
boundaries, exact preview and mutation binding, unknown recovery using original
operation bytes, erased receipt and retained-fence export. Full #239/ALL1 missing
handlers and ALL2 remain OPEN. Default target off; device/provider/real data UNRUN.

Current implementation consumes peer READONLY contract.ts/rows.ts/protocol.ts:
trip/device/progress selected UUIDs (not guessed UUID input), closed field mirrors,
full-field private preview, independent bundle/request digest + complete-page
proof, historical retained receipts bound to outer current owner (historic session
is data only), and explicit provider accepted/unknown + device copy effects.
Producer freeze/final source comparison remains required. Command/model/row/protocol
parse PASS; full Native build/test UNRUN until exact PBX lease/membership.

Exact cleanup patch request for Main release (no write performed):
NativeSession.swift after subject=nil/mobileEpoch=nil/displayName=nil and before
MaterialReferenceExportFile.eraseAll: add NotificationDataExportFile.eraseAll,
failure notificationDataExportCleanupRequired/storageError/return false.
Within existing !preservePendingJournals branch before MaterialReferenceJournal:
add NotificationDataJournal.erase(endpoint current or disabled, owner, vault),
failure notificationDataJournalCleanupRequired/storageError/return false.
Retain existing preservePendingJournals path and cleanup index unchanged.

Concrete caller structure is now implemented in owned Consumer/View/Store. It
accepts actual catalog module + coverage store + session-created scoped store +
client + coverage client. Consumer matches current catalog exact module/version/
scope and records only validated receipt or exact protected-file output. Parent
scoped export proves prepared server file; system handoff remains explicit and
cancellation never claims external saved copy. No whole-account completion.

Exact Main caller lease request:
DataCoverageModuleView.swift destination adds notification scope (scope rawValue
id), and switch invokes NativeNotificationDataConsumer with module/store,
session.notificationDataStore(scope: scope), .init(current:{self.actor},
request:{try await session.notificationDataRequest(body:$0,actor:$1)}), current
coverage client and chinese. serverActions gets preceding version==notification
schema + exact sole TS scope + both notification handlers branch to destination.
Do not alter existing material/core/Memory/Trip/old business consumers. Catalog
IDs/version/selection must come from the final TS coverage registration only.

Current own source freeze is pending sole TS wire fixed source and Main lease.
Immediate product commits 5663a38c and 6334d4ad, followed by UI/store/consumer.
Original notification paths have no Native mutation; old notification local
journal/device OS copy explicitly excluded. Complete erase send-fencing remains
sole reviewed server/SQL implementation; Native never enables or sends APNs.

Owned NativeNotificationDataTests.swift now exercises five distinct risk groups:
exact-byte unknown/relaunch/changed-op/session/failed journal removal; late epoch
and foreground list response; original TTL/private-file cleanup-failure; full
owned-device columns (including SYNTHETIC aabbccdd fixture token) and missing/
foreign/broken-edge negatives; unknown recover with zero erase dispatch, expired
immutable original receipt and false-recall/late-decision rejection. All are
source implemented + frontend parse only so far. No discovered/executed test
PASS claim; signed real session HTTP/device/SQL are not represented by these tests.

Remaining precise Main-dependent work, already prepared in own code:
1. Grant only App/NativeSession.swift new notificationDataStore/request/own logout
   cleanup; Features/DataCoverage/NativeDataCoverageModuleView.swift own caller;
   NativeDataCoverageModels.swift exact sole TS catalog registration; PBX new own
   sources/test/fixture membership. Existing native tests and DataCoverage fixture
   files need separately exact catalog-version/denominator-only release if TS
   final registry changes them. No simultaneous writers/no entire old file copy.
2. Normally integrate immutable sole TS fixed closed wire; compare independent
   Native columns/scopes/rows/proof/receipt against final producer fixture once.
3. With actual membership, one affected unsigned Native build/test run, including
   actual NativeSession URLProtocol epoch/401/unknown-request preservation path.
   Reuse unchanged old module evidence; no expanded matrix/target grant or phone.
4. Freeze resulting commit for sole TS normal integration. Whole #239 missing
   handlers/ALL2 OPEN; actual worker fencing remains sole TS/SQL/Main reviewed work.

Review-ready shared patch: SharedNative.patch (NOT applied). `git apply --check`
PASS against immutable f1f065c8 base. It contains only new NativeSession request/
factory + two own cleanup sites; new coverage destination/caller; PBX membership
for eleven own sources + NativeNotificationDataTests. New source IDs checked
collision-free and each file has its actual app/test source membership in the
proposed patch. No existing test, original notification worker/business code,
source oracle or old membership is replaced. The scope/schema guard waits actual
sole TS registered module. Final catalog IDs/version and minimal fixture mirrors
are intentionally absent until the unique producer declares them.

Consumer keeps its store in @State and constructs it once in .task via session.
It does not construct a protected writer during parent render (which could purge
an already delivered file when coverage receipt changes). This depends on the
proposed factory/request methods and is not app build/test PASS before integration.

Current checkpoint 2026-10-06: owned code and five risk tests source delivered;
shared lease + frozen TS catalog/interoperability fixture outstanding. The request
requires shared precision release before write, so remaining Session/caller/PBX/
catalog integration and true native test execution cannot proceed in this phase.
Only Main can relay that release; no other task has been messaged directly.
No SQL, target, provider, credentials, grants, production or real user data action.

## Main exact release consumed; v2 actual integration

Main9c1b62/505f15 explicit release received in this session. Normal immutable TS
7be21fd8 merged at13acabaf, shared review patch applied ONLY to authorized Session
new factory/request/two cleanup sites, ModuleView notification destination/caller,
PBX eleven own app sources + sole own test membership. Product9db0b4fb includes
v2 committedAt and drainProof independently verified. Trip/device terminal receipt
needs exact monotonic-drain/1 positive generation, waitMs5000, finishedAt matching
SQL-stamped drainedThrough and decidedAt; committedAt must be within original
preview TTL but terminal decidedAt may follow it. Progress-only proof nil and
zero drain; all source effect counts zero except pageProgress/fences. Old v1
receipt keys/expiry-only drain cannot complete Native. Progress inventory now
includes originalSessionId/originalMobileEpoch, all pageProgress column mirrors,
fenced state, effects/drain/receipt consistency, current owner + historical-session
record semantics. No actual SQL/APNs claim follows from these consumer checks.
Native erase command additionally verifies recover-wrapper cap before retention.

Six own Native tests now include actual NativeSession unsigned URLProtocol
control flow for unretained erase denial, lost ACK, 401 preserving unknown journal,
failed explicit logout cleanup/new-login denial, successful explicit cleanup. The
unsigned fixture is not signed GoTrue/HTTP/provider acceptance. Original Session
flows/EntryResume/material4stores/old journals untouched except additive own cleanup.
Current own Harness /tmp/vpj58-notification-native-r1 at9db0b4fb runs actual pinned
Xcode27.0/27A266a, unsigned app build + ad-hoc own fresh Simulator tests; result
pending, no discovered-test PASS. Earlier preflight first lacked DEVELOPER_DIR;
local per-command installed pinned path corrected, no toolchain/global config change.

### Narrow additional label/inventory release needed from Main

Actual NativeDataCoverageView enumerates NativeDataCoverageCopy.order, not just
Models.moduleIDs. If sole TS final catalog adds device/progress module IDs, Models
alone cannot make them discoverable. Request ONLY Copy.order two exact final IDs,
new notification scope titles/missing copy (old metadata-only delete text must not
remain for new own handler), preserving old scopes/Copy states/other copy. Could
alternatively Main supply precise own View lookup patch, but no shared unleased
write performed. Final Models catalog version/IDs/selection and unique TS producer
interoperability fixture still wait actual sole TS registration. Original coverage
fixtures/tests require separately precise catalog-only release if producer changes
version; Native will not rewrite their unrelated assertions or oracles.

## Actual native r1 result — 2026-10-06 04:46 CST

/tmp/vpj58-notification-native-r1/tests.xcresult authoritative summary: total6,
passed6, failed0, skipped0, expectedFailures0, runtimeWarnings empty. App unsigned
build PASS, ad-hoc test build/signature verification PASS, actual owned iPhone17Pro
Simulator iOS26.5 test execution PASS. Owned DC572517-B141-4C8A-A6CF-A16FA80F5300
was strictly shut down/deleted by the repository harness; original reference and
other task Simulator untouched. Source tested9db0b4fb; a78caf89 only removes final
blank test-source line and adds WIRE prose. No additional runtime change or test
rerun after PASS. Both current independent scope/boundary constants equal sole
immutable TS7be21fd8; Native full column/DTO/proof state v2 aligned there.
Raw logs under /tmp/vpj58-notification-native-r1/{build,test-build,tests}.log,
commands/environment JSON keep actual version/scope. Unsigned synthetic NativeSession
URLProtocol does not prove live GoTrue/API/SQL/provider/target/device-human.

Shared implementation checkpoint: ready for Main/sole TS normal integration now;
full scoped feature NOT claimed complete until final registered catalog version/
IDs, deterministic visible order labels and producer fixture interop are joined.
Main-approved Models changes are prepared but no final catalog was supplied yet.
Copy.order additional exact release requested above; no unrelated rewrite.
This current integration is fixed/validation stage, not two new ongoing product
writers or test-count filler. Full #239/full ALL1 missing/ALL2 remain OPEN.

## Final catalog v4 and visible entry lease consumed

Main grant received: Copy.order/titles/notifications missing text, Models .4/34/
two IDs/notification_records selection, existing Native catalog fixtures/tests
catalog/digest/denominator-only. Normal sole producer8a5840f2 merged; CATALOG.md
and native-catalog-v4.json now immutable source. Actual own consumer opens only
notifications/trip, notification_devices/device, notification_exit_progress/progress
with schema notification-data/1, exact notification_data export+delete handlers,
server location and notification_records selector. Alias, old metadata handler,
wrong module identity/version/scope cannot open the full data consumer. Exact scope
mapping is reused by shared ModuleView and completion; no second protocol.

Copy order inserts devices/progress immediately after notifications/before lifecycle.
Existing other32 relative positions and labels preserved; notifications title now
full Trip data. Three actual scopes are visible through original Coverage page.
Other device/server/external missing denominator remains. New immutable producer
resource mirrored byte-for-byte to owned Fixtures/NotificationData and linked only
in test resources. New sole NativeNotificationDataCatalogTests exercises exact
34 visible order, three source-qualified consumer mappings/zh-en scope titles,
old scope/version/handler/selection negatives and retained financial/attachment
missing entries. This is new catalog-only evidence; original six risk tests reused.

Original NativeDataCoverageTests changes only three count32->34 assertions. Original
coverage-producer/cancelled fixtures update catalog version/new registry descriptors,
opaque outer catalogVersion byte only + SHA256 outer requestDigest. UGC/publication
handler payloads, cancellation/tampered state/reason and all foreign/promotion /
cleanup/TTL assertions are unchanged and independently compared. No old tests
removed or loosened. Actual Native affected catalog + old coverage tests next;
no larger device/UI/provider/SQL matrix and no source-target activation.

## Final Native owned code fixed — catalog r2 actual PASS

Product freeze993d5cb0fdde1346bc5dd2e9d482a4d5c643163d. Native complete owned scope:
actual coverage-page34 inventory/order + three exact notification_data destinations,
original current actor/session/epoch/reauth request, full fields/boundaries, explicit
same-op erase/export confirmation, protected real file, exact journal/recover,
monotonic drain terminal proof and scoped parent result. Sole TS8a5840f2 normal
integration supplies unique producer wire/catalog4. No remaining Native file lease
or producer catalog wait. Main/sole TS may take this immutable Native HEAD normally
NOW; do not wait for evidence formatting or expand matrices.

Actual /tmp/vpj58-notification-native-catalog-r2/tests.xcresult summary12PASS0FAIL0SKIP:
NativeNotificationDataCatalogTests1 (actual immutable TS catalog+visible order+three
closed module mappings) + original NativeDataCoverageTests11 (all original business/
negative/TTL/cleanup/Session assertions preserved, only admitted catalog/digest and
count34 adaptation). Unsigned app build/ad-hoc signed test build PASS. Owned
2D433C68-227A-4340-A3EB-1AEA8413B3DC iPhone17Pro/iOS26.5 Simulator strictly deleted.
Original notification six risk tests r1 at9db0b4fb6PASS0SKIP are reused separately,
NOT asserted to have rerun on993d5cb0. Those tests unchanged byte-for-byte; final
app change only metadata/mapping, constructor/action wire remains unchanged.
7be21fd8->8a5840f2 TS contract/rows/protocol diff empty, confirming v2 risk proof
scope still applies. No new device/provider/target matrix.

Old metadata OwnerBundle helper and its existing negative oracle stay unchanged;
new three scopes use ONLY independent NotificationDataProtocol and Session route.
The inherited legacy Native coverage emitter sample is not counted as new full
notification-data wire proof. New Native catalog producer proof is the exact
immutable8a5840f2 resource, not that legacy metadata sample. Final combined real
server registration/SQL/GoTrue data path remains sole TS+SQL normal integration;
Native target UI/human/device/provider/backup/all-account acceptance UNRUN.
Whole #239/full ALL1 remaining handlers/ALL2 stay OPEN, allUserDataCompletedfalse.

## Same-task exact retained-fence finding and repair

Mainc0316f actual source finding is valid: previous Native0fa92171 retained only
8 kinds while fixed sole TS/SQLc013 preserve actual outbox_parent/watch_semantic.
Prior code-complete/source-aligned statement is superseded for this concrete
consumer gap; earlier6 and12 tests did not cover these real retained rows.
No TS/SQL reverse narrowing and no other writer or matrix is used to close it.

Normal immutable sole TS6d66ad62 integrated (not its dirty AGENTS/next-env files).
Actual Native runtime repair b918623b is exactly adding those two kind literals
in NativeNotificationDataRows.fenceRows. Independent source comparison confirms
ALL other keys/owner qualification/UUID/hash/sort/cap/TTL guard bytes unchanged,
and Native10-kind list now equals that exact producer. Existing worker/SQL/API/
other Native consumers are unchanged by this Native delta.

Sole producer synthetic native-trip-retained-preview.json (approved TS decoder
PASS) is copied byte-for-byte to owned Native test resources. One unique affected
NativeNotificationRetainedFenceTests case consumes it for full retained preview
and complete bundle -> real protected private file readback, plus unknown kind,
UUID/hash, wrong Trip, extra key, ordering and expiry negatives. Its default
fixed fixture clock and unsigned app test are not actual user/GoTrue/provider
or restore-target acceptance. Source includes no sensitive body or token.
New app/test/resource PBX IDs only; original fixtures/tests/membership unchanged.
Productb918623b ready NOW for normal Main/soleTS integration; actual owned pinned
Harness /tmp/vpj58-notification-retained-fence-r1 executing just this1case, result
pending. Original6 andcatalog/coverage12 evidence are reused separately.
