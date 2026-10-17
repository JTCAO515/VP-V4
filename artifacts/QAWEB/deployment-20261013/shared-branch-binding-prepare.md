# Shared QA branch binding preparation — candidate only

Current request source: Main's immutable commit `7d0c5128857e859720452d8a9f864fd8b20c8388`, branch `codex/qaw005-independent-target-20261013`. The branch name is historical: JT explicitly approved the existing shared `dzqdzetcctkhbrhlxxgn` target. It does not imply database isolation. Main clarified its temporary checkout `codex/qaw005-runtime-followup-20261013` / a688acc4 is only PR685 integration and is not the QA candidate.

## Actual readback and prepared package

- CLI59.20.0 authenticated as jtcao515; exact Vercel project/team prj_XwsjEc8YnYNeDVAqBrcdmbJXEqA2 / team_vLT8SL2mQJJSnXbD9GzVLP4K, JTCAO515/VP-V4 Git link, productionBranch=main verified.
- qatesting.go2china.space remains assigned to codex/qaw005-main-20261013 and verified=true. No domain, alias, WAF or environment was changed.
- Current project QA variable names only show old-branch VISEPANDA_QA_AGENT_ORIGIN. New branch target-ref/Origin are absent; the packet contains only nonsecret create candidates for VISEPANDA_QA_SUPABASE_PROJECT_REF=approved shared ref and the existing QA hostname Origin, scoped to preview and exactly the new branch. No key/policy/QA-enable/budget fields are generated or copied.
- Remote independent-target branch is not yet pushed. The actual generated candidate explicitly records remoteExactMatch=false and resourceMutations=0; there is no new target URL or READY claim.
- `binding-candidate-7d0c5128857e.json` binds the exact source/spec/config/target/profile/worker SHA256s, profile/4 and target-package/2, current domain branch, proposed new branch and explicit shared ref. Public Web URL must exactly match https://dzqdzetcctkhbrhlxxgn.supabase.co; actual runtime Auth/Session/provider/budget remain UNRUN.

## Minimal executable preparation and scope guards

```sh
PYTHONDONTWRITEBYTECODE=1 python3 scripts/qa-agent-deploy/pin.py \
  --candidate-sha 7d0c5128857e859720452d8a9f864fd8b20c8388 \
  --branch codex/qaw005-independent-target-20261013 \
  --expected-domain-branch codex/qaw005-main-20261013 \
  --target-ref dzqdzetcctkhbrhlxxgn
```

The helper reads immutable `git show` objects; it never switches, resets, uploads or edits Main's possibly changed working tree. Only the old QA branch and the confirmed new QA branch are accepted; main/Production, staging and runtime-followup are rejected. Missing/unapproved ref, wrong team/project/Git link, current-domain drift, opaque/mismatched existing ref and an effective QA-enable variable fail closed. Metadata output excludes environment values and credentials.

`--reviewed-sha <final Main pin>` prepares a Git-source Preview request only after exact remote branch SHA matches; it is still not a mutation command or review/CI attestation. The tool never applies the domain candidate. Main must first supply exact-head review and required CI PASS on the final pushed source; only then may the sole resource writer perform the separately scoped nonsecret branch setup/preview and QA-domain binding. Preserve Production/staging aliases/environments, existing private keys, policy, budget and all runtime flags. No provider expense follows from JT's A–D plus conditional E database capture/rehearsal scope.

## Actual checks

PASS: 6 offline binding negatives/scope cases, source syntax, actual candidate generation/readback and diff/docs checks. Cases cover missing/invalid/foreign refs, Production/followup branch denial, wrong project/domain scope, opaque ref/QA-enable refusal, unpushed/changed reviewed remote rejection, preservation of current domain and no secret-value serialization. The earlier mutable-head limitation was replaced by immutable source-object checks to handle Main's independent checkout safely.

UNRUN: final source review/required CI/remote exact-match, new branch real deployment/targetURL, QA domain switch, target Auth/Session/provider acceptance. No ECS/login/installation, key import/re-input, model/budget enablement, target SQL, WAF, Production or staging changes. Existing #683 ownership remains with this chat.
