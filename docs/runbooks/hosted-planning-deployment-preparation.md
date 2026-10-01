# VPJ-80 profile/2 deployment preparation

This repository-only preparation uses the existing hosted worker lifecycle. It does not authorize target writes, credential transfer, paid calls or activation. The existing profile/1 S1 command and frozen validator remain available; profile/2 requires explicit `--planning`.

## Offline package

Use Node 22 and Python 3. Provide a closed runtime `vpj07-hosted-text-worker/2` profile with nonnull `planning` and a nonsecret target JSON with exactly these fields:

```json
{
  "schemaVersion": "vpj80-planning-deployment-target/1",
  "environment": "staging",
  "databaseUrl": "https://dzqdzetcctkhbrhlxxgn.supabase.co",
  "ownerId": "11111111-1111-4111-8111-111111111111",
  "planningPolicyId": "22222222-2222-4222-8222-222222222222",
  "scopeId": "33333333-3333-4333-8333-333333333333",
  "build": "abcdefabcdef",
  "qwenEndpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  "startupState": "disabled",
  "restartPolicy": "no"
}
```

Example IDs/SHA are placeholders, not approved selections. Target IDs must match the runtime profile. The endpoint must pass the existing Beijing endpoint allowlist. Runtime profile validation is reused directly, including modes, bounds and Qwen pricing shape. This does not verify that the selected policy, price version, budget or credentials exist or are authorized.

```sh
python3 deploy/hosted-worker/prepare-planning-profile.py \
  --profile selected-profile.json --target selected-target.json --out NEW_PRIVATE_DIR
node --experimental-strip-types deploy/hosted-worker/validate-planning-profile.mjs \
  NEW_PRIVATE_DIR/hosted-profile.json NEW_PRIVATE_DIR/planning-target.json abcdefabcdef
```

The packager creates a new 0700 directory and canonical 0600 files, refusing duplicate JSON keys and existing output paths. The target adds the SHA-256 of the canonical profile. Selection metadata is not an approval object. Files contain no credentials; the profile reaches Docker Config.Env. Never put secrets in either input.

## Approved host preparation, still disabled

Only after separate target-specific approval, install the package at `/etc/visepanda/planning/` (root:root 0700; both files root:root 0600, regular, one link). Node 22 must be available with the reviewed repository checkout because the validator imports the merged runtime modules. Place distinct DB, Qwen and AMap keys through the existing secure handoff into `/run/vp-worker-secrets/{db,qwen,amap}.key`: tmpfs, uid/gid 1000, directory 0700, files 0400, one link; swap disabled. This document does not grant that handoff.

Approved commands are `ecs-worker-files.sh preflight --planning` and `ecs-worker-files.sh start <selected-SHA> --planning`. Start requires an already loaded image tag matching the package selection; tag provenance must be checked separately. No image pull, replacement, migration or SQL enable occurs. `status` and `stop` address the same existing container name. Preflight creates/checks the private journal directory and checks local metadata; it does not prove the SQL switch. Runtime file-mode startup independently requires the SQL switch to be disabled before journaling/polling. Restart policy remains `no`, no host port is published, and Docker receives bind paths, not key values. Package hash detects accidental alteration; root controls the package and it is not a signature.

## Readiness observed 2026-10-01, not refreshed by these commands

At 14:49–14:56 UTC, Staging `dzqdzetcctkhbrhlxxgn` had 75 applied migrations versus 90 on the audited main, SQL worker disabled, zero heartbeats/queued jobs/leases/unresolved attempts, zero current Qwen policies/text consents/usable scopes. Planning tables/preflight were absent. Fifteen migrations were missing:

- `20260922033000_vpj_11_travel_pace_control` (out of order, below applied maximum `20260923140000`)
- `20260926113804_vpj34_storekit_grants`
- `20260926132008_vpj35_u1_text_capacity`
- `20260926150000_vpj36_trip_deletion_queue_reader`
- `20260926170000_vpj35_u2_trip_confirmation_receipt`
- `20260926180000_vpj35_u2_text_capacity_boundary`
- `20260927010000_vpj11_explicit_memory_create_undo`
- `20260927021000_vpj78_conversation_membership`
- `20260927030000_vpj79_comparison_results`
- `20260927040000_vpj80_planning_action_receipts`
- `20260927050000_vpj78_goal_trip_link`
- `20260927055000_vpj79_exact_trip_results`
- `20260927060000_vpj80_planning_comparison`
- `20260930010000_vpj82_result_search`
- `20260930020000_vpj80_hosted_planning_target`

Replay the actual missing set on a disposable copy of the 75-migration target, including the out-of-order migration; a latest-empty-schema test is insufficient. Applied SQL byte equivalence and backup/recovery remain UNRUN.

`staging.go2china.space` still selected Preview deployment `dpl_5eBh1Exfo4W8rXEh1T3AazJnUjXW`, created September 12 05:16 Shanghai, branch `codex/s2-native-ask-io-20260911`; the planning policy API returned 404. Existing old-purpose key metadata does not authorize reuse. Current ECS login/instance/Docker/SHA/disk/key inventory remained UNRUN.

Separate approval objects must specify: (1) the 75→90 schema window, backup/recovery and invariants; (2) exact reviewed Preview SHA/env/alias; (3) exact host instance/image SHA, security checks, credential purpose/handoff and disabled startup; (4) one owner's ordinary-auth notices/consent plus policy/scope, price version, amount and expiry; (5) one paid model attempt and at most 13 map actions, independent map budget, concurrency 1 and agreed recovery fault windows. Device acceptance also requires the signed build/device/window. Historical S1 ¥7 is only a candidate, not planning budget approval. Unknown outcomes retain holds and must not be replayed. Rollback stops producers, sets SQL disabled and drains/stops the same worker; schema stays forward-only and an old API alias must not be restored while planning jobs remain active. Parent #561 remains open until real provider/recovery/device acceptance.
