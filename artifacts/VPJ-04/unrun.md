# VPJ-04 retained runtime gates

#191 remains OPEN. This prepares credentials and adapter reuse only; it does not implement
NativeActorContext/session v2 or active mobile data access.

- Authoritative mobile-session epoch, session owner/status checks, second-phone replacement
  excluding Web sessions and atomic enforcement of session state on writes: UNRUN / unavailable.
- Real native login, refresh, logout, Keychain/cache/push ownership and iOS→API→RLS owner/other-user,
  expired/replaced/deleted-account session behavior: UNRUN.
- #188 and #189 full runtime acceptance is not established by these tests. Their remaining
  native/device and permitted database migration/isolation gates stay with those parent Issues.
- Real Auth or database/RLS acceptance, production/provider calls, migrations and account actions:
  UNRUN. The existing local Supabase stack was neither probed nor altered.
- Full test:integration, database-backed security and db:verify were not run. They need the
  identified permitted environment; no skip/green result replaces that acceptance. The complete
  affected identity security suite ran with intercepted SDK transport and zero skips.
- iOS build/device checks and browser acceptance remain outside this server preparation slice;
  no UI, route or native consumer changed. Full required CI and independent exact-HEAD review
  remain required before integration/merge.

All JWTs, private signing keys, sessions and HTTP responses in tests are synthetic and ephemeral.
Tests pass public configuration explicitly; no real key/environment read or write occurs. No
HTTP route consumes the native factory, and it always rejects data access without mobile epoch
validation. A verified JWT-bound client is internal credential material, not atomic write authority.

Rollback: revert this isolated slice, preserving normal Web behavior and user data. No migration,
live configuration, accepted architecture, account or provider permission changes need reversal.

Native request-lifetime hardening has controlled SDK and actual isolated GoTrue/HTTP evidence;
it does not provide new remote, physical-device, signed-store or push-binding acceptance.
Natural expiry/Keychain tests from earlier work were not rerun for this server-only change.
Default environment-dependent skips remain; see native-io/commands.jsonl.503 is not rollback proof.

## 2026-09-17 current-main recovery rerun

- A new `run-native-io.mjs --simulator` mode creates two owned iPhone 17 Pro simulators, builds
  the current scheme, injects only the explicit loopback API origin into a transient xctestrun,
  and guarantees simulator/account/stack cleanup. It replaces stale fixed UDIDs and a fixed
  `/tmp` build location; ordinary no-argument and `--same-trip` modes remain unchanged.
- The current runner could not reach account creation: a fresh disposable full migration replay
  stops in `20260909223841_vpj_04_native_mobile_sessions.sql` with `Unreviewed definer RPC
  inventory`. The migration's fixed list is evaluated after the earlier VPJ-02 repair already
  changes the public SECURITY DEFINER inventory. This is a reproducible VPJ-02 migration-history
  compatibility FAIL, not an identity authorization result. No Supabase user, account, Trip or
  simulator was created by the failed attempts; each disposable workdir was removed.
- This task must not edit an applied historical migration or skip its inventory guard. Until the
  owning VPJ-02 migration replay fix is merged, current-main real local Auth/RLS/natural-expiry
  and the new two-Simulator run remain UNRUN. Existing 2026-09-10/11 evidence stays historical.
- Current Preview native session endpoint returned Vercel 403 and `staging.go2china.space`
  timed out. Its Native Staging variables remain scoped to historical Preview branches, so no
  current remote activation or real-user account probe was attempted.
