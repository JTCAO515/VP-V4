# AI-05 Security and Privacy Threat Model

Status: accepted architecture threat baseline for [AI-05](https://github.com/JTCAO515/VP-V4/issues/7). Controls listed as “later” are requirements for their owning implementation issue, not current production protections.

## Trust boundaries

```text
Browser and uploaded input: untrusted
External provider/source and retrieved content: untrusted
Model output: untrusted
Ops actor: authenticated but least-privileged
Domain validator and policy gate: trusted enforcement boundary
Database/RLS and role-scoped RPC: final authorization boundary
Worker secret/private schema: isolated system boundary
```

No trust boundary permits a model, browser, provider, or generic server code to write Trip/Fact/permission state directly.

## Threat-to-control matrix

| Threat | Required prevention / containment | Future verification owner |
| --- | --- | --- |
| Prompt injection from web, Fact, OCR, or attachment text | classify external content as untrusted data; task-scoped tool allowlist; validated structured outputs only | AI-12, AI-42 eval corpus |
| Excessive AI agency | read/propose tools only; immutable proposal; visible user confirmation; deterministic patch | AI-09, AI-10, RL-01/RL-03 |
| BOLA/IDOR or cross-user leakage | verified actor, owner filter, RLS, role-scoped RPC, negative actor matrix | AI-14, RL-01/RL-02 |
| Candidate/draft/private Fact publication | candidate-first isolation, independent review, shared eligibility at every consumer | AI-11, AI-23–25, RL-02/RL-08 |
| Unsupported high-risk claim or wrong receipt | typed GroundedClaim with current EvidenceReceipt; unavailable when unsupported | AI-20, AI-42, RL-04/RL-05 |
| Data-policy or licence bypass | complete policy record before every display/cache/persist/prompt/embed/translate/TTS action; no fallback bypass | AI-22, RL-06 |
| Secret exposure | server/worker secret store only; secret scan; never browser/build/log/fixture/chat | AI-17/AI-32 and release gate |
| Raw-media leakage | signed private object path, short explicit TTL, delete receipt, allowlisted traces only | AI-30–32, RL-07 |
| SSRF from image/source URL | URL allow/deny, DNS/IP/redirect validation, fetch isolation | AI-30/AI-35 security tests |
| Malicious/oversized upload | magic/type/size/decode limits, malware scan, private storage | AI-30 security/integration tests |
| Replay/double apply | idempotency digest, proposal status/revision and CAS checks | AI-10, RL-01/RL-03 |
| Cost denial | per-user/task quota, deadline, bounded tools/model attempts, explicit unavailable | AI-48, AI-17 |
| Telemetry exfiltration | record allowlisted metadata only; no raw model input/output/reasoning/media | AI-17, RL-07 |
| Deletion gap | delete Trip/media/derived text/trace references/provider files where supported; record outcome | AI-49, AI-50 |

## Threat response rules

1. Policy, safety, ownership, and validation denials fail closed; they are not retried through a different model or provider.
2. A provider/transport failure may use only an already-approved fallback that passes the same policy/class/region checks; otherwise return unavailable.
3. No control relies solely on prompt text, client UI hiding, TypeScript type checks, or a model’s claimed safety behavior.
4. Raw sensitive content is never placed in a general trace to make debugging easier. Diagnostics use correlation IDs, class, policy receipt ID, outcome code, timing, and non-content counters.
5. A security incident, credential rotation, retention breach, or policy revocation disables the affected route first. Re-enablement requires the owning runbook, evidence, and release gate.

## Current maturity and acceptance

Current maturity is fixture-only: there is no V4 database, provider, model, upload, worker, Ops deployment, or production traffic. AI-05 therefore contributes threat/control ownership and fail-closed requirements only.

| Dimension | Status | Evidence or limit |
| --- | --- | --- |
| Functional | applicable | named denial and containment decisions are frozen |
| Interface | applicable | policy/actor/validator/RLS boundaries have designated owners |
| Data | applicable | C0–C4 and policy record requirements prevent class-free handling |
| Security | applicable | threat matrix maps each threat to a later deterministic check/owner |
| Performance | not applicable | no running request path |
| UX | not applicable | no UI changes |
| Observability | deferred | future traces/alerts must use allowlisted metadata and an owner/cadence |
| Compliance | applicable | no legal claim; policy/region/retention/rights remain explicit gates |

L1–L3 documentation/build checks are run for this issue. L4 security, L5 device, L6 staging, and L7 production evidence remain unrun until the relevant runtime components exist.
