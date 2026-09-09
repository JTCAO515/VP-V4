# VPJ-02 RPC compatibility repair

This repository preparation adds `20260909033302_vpj_02_repair_local_rpc_runtime.sql`.
Original24 migrations and stored data remain unchanged. Remote execution is a separate
explicitly authorized operation. Local rehearsal is not Staging/product acceptance.

## Restricted definer exception

`revise_trip_proposal(uuid,text)` changes from SECURITY INVOKER to SECURITY DEFINER.
This is an explicit execution-privilege change: the old invoker cannot lock a Trip after
V4-10 removed authenticated UPDATE. Direct table UPDATE stays revoked. No broader role
or table grants are added. The definer can only prepare an unconfirmed title-only child;
canonical Trip writes still require Proposal -> visible diff -> user confirmation -> Patch.

Because definer execution does not enforce caller RLS, it explicitly preserves each
applicable predicate from the final pre-repair policies:

| Existing policy/gate | Equivalent RPC protection |
| --- | --- |
| proposal SELECT owner | Load parent only where owner_id = auth.uid() |
| proposal UPDATE USING owner + pending | Reject missing/nonpending parent before writes |
| proposal UPDATE WITH CHECK owner + allowed status + rollback_snapshot_version IS NULL | Reject every non-null rollback parent before expired/conflicted/superseded writes; retain owner and only those allowed outcomes |
| proposal INSERT WITH CHECK owner + pending + rollback_snapshot_version IS NULL | Copy the verified parent owner, insert pending child, omit rollback metadata (NULL default) |
| Trip owner visibility | Lock Trip only where owner_id = auth.uid(); no other-owner row can be used |
| expired/stale protection | Expired normal parents become expired; version mismatch becomes conflicted; neither creates a child nor mutates Trip |

An absent auth.uid() is forbidden. Null/invalid titles are rejected. Already resolved
parents cannot be revised. Rollback proposals are exclusively handled by their existing
rollback-confirmation path, including when expired or stale; this revision RPC leaves
parent status/metadata, child rows and canonical Trip unchanged.

## Caller rights and other repairs

All repaired definer functions use the fixed `pg_catalog, public, pg_temp` search_path;
private row access is qualified and ownership checks remain explicit. PUBLIC/anon execution
is revoked for the revision RPC, and authenticated is the only application caller.
Existing caller ACLs are retained for other repaired RPCs: authenticated may invoke
start/cancel chat, create full-patch proposals, save its profile and request privacy actions;
append_chat_turn_event remains service_role-only. Ordinary owner calls to that append RPC remain403/42501.
The pure JSONB patch helper remains invoker and uses PostgreSQL's jsonb_object_keys count.

The UUID chat idempotency signature and text storage remain compatible through explicit
casts. Other changes qualify ambiguous columns or existing unique constraints; public
signatures, event sequencing, receipt uniqueness and privacy execution states are unchanged.
Privacy requests still record requested/not_started only; no export or deletion executor
is introduced. Trusted-writer tests use an in-memory, local-only service actor fixture.

## Verification and rollback

Local validation must replay frozen files from11 ->24 ->25, preserve a synthetic pre-upgrade
Trip, pass integration/security without skips, and pass DB lint. Tests cover normal,
expired and stale owner rollback-parent revision attempts with no side effects, plus
owner/stranger/anon boundaries, idempotency, terminal cancellation and append-only rollback.

Do not roll back database history or regrant direct UPDATE. If a repair must be withdrawn,
use a reviewed forward migration restoring the affected function definition and disable
its caller until fixed; restoring the invoker revision implementation also restores its
known lock failure. Repository revert alone does not change an applied database.
