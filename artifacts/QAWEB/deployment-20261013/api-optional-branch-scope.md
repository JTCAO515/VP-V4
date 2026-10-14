# Actual Vercel optional branch scope adaptation

Actual14-Oct project getter, dedicated GET env endpoint with decrypt=false, and official CLI env list JSON each returned a complete50-record list with key/type/target present, but24 records omitted gitBranch. The existing strict helper correctly refused preparation, exposing an adapter gap before any domain action.

The live official OpenAPI env record schema defines gitBranch as optional; Vercel's environment-variable documentation distinguishes all-Preview variables from branch-specific overrides. A missing gitBranch is treated conservatively as having no branch restriction, so it is INCLUDED for the requested Preview branch, never silently excluded. Missing env/key/type/target, unknown/empty/invalid target scopes and malformed supplied branch/custom scopes still fail closed. Missing gitBranch on QA-enable or opaque-ref still triggers the original refusals. This preserves the Spec P2's unknown-target safety while supporting actual platform metadata.

- Primary references: https://openapi.vercel.sh and https://vercel.com/docs/environment-variables#preview-environment-variables.
- Actual local11 tests PASS, including missing-branch enable/opaque-ref refusal, legal unqualified records, and all prior incomplete-inventory/invalid-scope negatives. No key or environment values are serialized except the explicitly approved nonsecret ref/Origin candidates.
- Exact037486da tree1c1f5fa66b8f9d04898ee324aa78383970bdad02 equals accepted eba6ea343cb2764e791f56bf24ccfbe454f91045 tree. No mutable Main checkout is used or changed.
- Approved routine creation added only new QA branch's VISEPANDA_QA_SUPABASE_PROJECT_REF and VISEPANDA_QA_AGENT_ORIGIN as plain Preview config. Same-project MCP returned404, then its documented exact-endpoint/team CLI fallback succeeded under jtcao515; no permission rejection or identity change. No upsert/overwrite; all pre-existing50 env metadata records unchanged.
- Current QA domain still points to codex/qaw005-main-20261013; QA-enable variable remains absent. Production/staging/DNS/WAF/credentials/policy/budget/ECS unchanged. Proof: branch-config-037486da.json.
- Existing automatic037 Preview was built before these new variables. It is not runtime proof of this new configuration. Final fresh exact-source build and public binding await applicable037 CI completion/Main cutover gate. Custom WAF allows only the explicitly approved QA hostname; this task does not allow a new Preview hostname or wildcard.

Config presence, a prepared packet, same source tree and build READY remain distinct from actual Auth/Session/provider runtime acceptance. Model fees are not granted by database capture/rehearsal A–D plus conditional E. No provider or budget flag was enabled.
