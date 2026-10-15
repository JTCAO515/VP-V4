## Summary

Related to #264 / AGENT-013. Existing H04 tooling only parsed supplied recordings;
Harness now has a callable current-context Native v4 Ask acquisition driver.

```text
session/policy/history/selected Trip → explicit single submit
  → original Turn events/readback → current eligibility/Trip → sanitized JSON + MD
```

Reuses Native submission DTOs, production grounded replay/history parsers and the
existing incomplete H01 grader behavior. No automatic consent/session/Trip,
unknown-ACK retry, provider switch, credentials or new writer/scorer. H01/H04/H07
expectations and resource limits are fixed before invocation; holdout is excluded.

## Evidence

- **Before:** no runtime-ask directory at accepted QA ded26ad7; recorded H04 had
  originAuthentication NOT_VERIFIED and did not request/submit/read back Ask.
  **After:** 16 direct tests drive the shipped module and bridge. One traverses
  actual Native identity/text/events handlers with intercepted SDK HTTP and
  in-memory synthetic signing keys; no live Auth/DB/provider is called.
- PASS: typecheck, lint, docs check, diff check. Covers actual path/ID order,
  unknown ACK/no second POST, qualification/identity/source invalidation,
  late response/abort, monotonic deadline, byte/read/request bounds, privacy
  and missing Trip completeness. Source head 1b521b37.
- Live Staging/provider/DB/fees/ECS/production, Web/physical-device and full #264
  acceptance NOT_RUN. Full collection, usage/cost/quota/key/context authority
  gaps remain unknown; no required-mode PASS or parent closure claim.

## Merge Danger

**Door:** two-way. The module is explicitly invoked and has no live default.

**Blast Radius:** Harness. The supplied ordinary-user transport owns actual
credentials/target/session binding; an explicitly permitted invocation can
submit to existing Ask, which may incur provider work outside this repo-only
delivery. No mutation retry or new authority is added. Main owns shared hookup.
