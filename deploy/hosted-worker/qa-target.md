# QA file-mode endpoint package

The explicit `preflight --qa` / `start <build> --qa` path requires a reviewed nonsecret target at `/etc/visepanda/qa/qa-target.json` as well as the v3 profile at `/etc/visepanda/hosted-profile.json`. The target directory must be root-owned mode 0700; both files must be root-owned mode 0600 with one link and no symlink. The original tmpfs secret, journal, swap, container and disabled-heartbeat requirements still apply.

Prepare canonical file contents offline:

```sh
node --experimental-strip-types deploy/hosted-worker/validate-qa-target.mjs --prepare < reviewed-nonsecret-input.json > prepared-files.json
```

Input has exactly `profile` (the reviewed QA v3 profile) and `target`. Target fields are `schemaVersion: "qa-hosted-deployment-target/1"`, `environment: "staging"`, `databaseUrl: "https://dzqdzetcctkhbrhlxxgn.supabase.co"`, `ownerId`, `policyId`, `scopeId`, `noticeHash`, `build`, `qwenEndpoint`, `startupState: "disabled"`, and `restartPolicy: "no"`. Use the actual reviewed identities, canonical notice hash and exact loaded image build; include no credential. The output contains `profileJson` and `targetJson`, whose bytes must be preserved; the target binds the profile SHA256.

Both the legacy Beijing endpoint and supported Beijing workspace endpoint are validated by the existing provider allowlist. `start` revalidates the selected build and passes this exact endpoint through `VISEPANDA_QWEN_ENDPOINT`. Missing, malformed or changed packages fail before Docker create. S1 and planning paths retain their original validators.

This package grants no activation authority and does not create a policy, budget, consent or credential. Before host start, independently verify the approved fixed-target schema/RPC ACLs, new policy/notice, actual budget, safely held credentials and maintenance scope. Keep the SQL switch disabled for the first heartbeat. A successful offline check or mocked Linux Docker test is not real ECS/provider acceptance.
