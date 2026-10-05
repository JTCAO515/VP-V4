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
