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
