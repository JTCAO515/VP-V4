# Native intake planning HTTP v2 transport

2026-10-03. Additive transport only; #624 is merged at main a9e02f3a; tests load actual migrations from the current checkout. No old tasks route/signature change, SQL writer change or execution permission.

## Default closed gate

Main-aligned gate: VP_NATIVE_INTAKE_PLANNING_HTTP_TEST=1 is a disposable LOCAL harness gate, absent/default closed. Also require existing VISEPANDA_NATIVE_LOCAL_PLANNING=true and a qualified getNativeAssistantConfig with local loopback DB. Any VERCEL_ENV, native Staging/Production declaration, missing base capability or nonlocal DB returns503 before authentication/RPC. Expected DB/API are parsed loopback URLs with explicit ports. Configured DB origin must match VP_IDENTITY_SUPABASE_API_URL. Incoming API protocol/port must match VP_NATIVE_INTAKE_PLANNING_HTTP_API; NextRequest normalizes 127.0.0.1 to localhost, so only those two already allowed loopback hosts are equivalent. Path remains exact. VP_NATIVE_INTAKE_PLANNING_HTTP_PROJECT must match a fresh vp-native-ask-<8hex>; the runner validates the actual owned container identity. No deployed capability is enabled and no runtime flag registry/config/environment is mutated. Main must explicitly design/release any future non-test capability; this route's existence is not availability.

## Closed request

POST /api/chat/native/v5/planning/intake-tasks; native Bearer only, no Cookie/Origin/query, bounded16000bytes. Exactly nineteen client keys below. Text policy is server-derived from current assistant configuration; planningPolicyId is an expected ID checked against the server's current authorized planning policy/consent, never a policy/environment override.

```json
{"conversationId":"uuid","goalId":"uuid","expectedGoalVersion":2,"parentMessageId":"uuid","messageId":"uuid","messageKey":"uuid","threadId":"uuid","turnId":"uuid","taskId":"uuid","taskKey":"uuid","planningPolicyId":"uuid","locale":"en","text":"Explicit bounded transport comparison delegation","memoryBasis":[],"expectedIntakeMessageId":"uuid","expectedSourceSequence":8,"expectedIntakeRevision":2,"expectedIntakeDigest":"64lowerhex","intake":{"schemaVersion":"stay-area-intake/1","city":"shanghai","comparisonTarget":"area_transport","durationDays":10,"partySize":2,"interests":["food","photography"],"pace":"relaxed","lodgingBudget":null,"dates":null,"mobilityConstraints":null}}
```

The RPC mapping uses all twenty frozen parameters in declared order:

| HTTP/config value | submit_planning_comparison_v2 parameter |
| --- | --- |
| conversationId | p_conversation_id |
| goalId | p_goal_id |
| expectedGoalVersion | p_expected_goal_version |
| parentMessageId | p_parent_message_id |
| messageId | p_message_id |
| messageKey | p_message_key |
| threadId | p_thread_id |
| turnId | p_turn_id |
| taskId | p_task_id |
| taskKey | p_task_key |
| server current text policy | p_text_policy_id |
| planningPolicyId (current qualification) | p_planning_policy_id |
| locale | p_locale |
| text | p_text |
| memoryBasis | p_memory_basis |
| expectedIntakeMessageId | p_expected_intake_message_id |
| expectedSourceSequence | p_expected_source_sequence |
| expectedIntakeRevision | p_expected_intake_revision |
| expectedIntakeDigest | p_expected_intake_digest |
| intake | p_intake |

parentMessageId must equal expectedIntakeMessageId. sourceSequence1–999999, intakeRevision1–999, goalVersion1–10000, text1–4000 and localezh/en. memoryBasis≤3 unique UUID/exactpositive revision pairs. Memory refs follow SQL v2 set semantics: normalize only UUID case to lowercase, reject duplicate canonical UUIDs, sort the unique UUID/revision pairs for comparison. Submission still forwards the original client refs and SQL owns canonical admission/retry authority; this comparison never sorts intake.interests or other ordered arrays. Complete intake uses frozen stay-area-intake/1 parser. New identities cannot reuse expected source; taskId≠turnId. No owner/provider/environment/budget/execution flag or extra field is accepted. SQL revalidates the unchanged full projection, current source/CAS/policies/Memory and entire atomic admission; client JSON is not authority. No automatic retry.

## Exact receipt

Fresh201, identical retry200, version2 wrapper around exactly the frozen v2 receipt.

Historical response shape:

```json
{"version":2,"kind":"accepted","reused":true,"taskId":"uuid","turnId":"uuid","artifactId":"uuid","conversationId":"uuid","goalId":"uuid","goalVersion":2,"messageId":"uuid","messageSequence":9,"intakeRevision":3,"current":false,"readyForProvider":false,"executionAvailable":false}
```
 Match request's conversation/goal/newMessage/Task/Turn IDs, actual goalVersion, messageSequence and intakeRevision. No title/content/policy endpoint/lease/scope/budget is returned.

```json
{"version":2,"kind":"accepted","reused":false,"taskId":"uuid","turnId":"uuid","artifactId":"uuid","conversationId":"uuid","goalId":"uuid","goalVersion":2,"messageId":"uuid","messageSequence":9,"intakeRevision":3,"current":true,"intakeContextDigest":"64lowerhex-new-intake","planningContextDigest":"64lowerhex-planning","readyForProvider":false,"executionAvailable":false}
```

current=false has the same stable identity/version receipt but BOTH digest keys are absent. current=true requires both distinct-domain digests; intakeContextDigest is not the old expectedIntakeDigest and is never named bare contextDigest. Neither current/accepted/queued nor either digest enables execution. Both false flags are mandatory; unknown fields/flags/mixed/missing/historical digests failclosed503.

## Error and qualification

INVALID_INPUT400 for malformed/closed/body/query/headers. Missing/replaced/valid mismatched session401; malformed/transient identity RPC503. Current planning/text consent or policy/actor denial403 DATA_POLICY_BLOCKED. Stale input, Goal/Task CAS, NOWAIT contention or changed immutable key409 (existing specific taxonomy preserved). Dependency/malformed RPC503 PROVIDER_UNAVAILABLE. Every response private,no-store. Initial and final active native session are checked; current server planning policy/consent is qualified before write. No retry fallback and no new work on disabled entry.

## Local verification / pending dependencies

Own ports64720; all actual current-checkout migrations are copied into a uniquely named disposable migration directory. No Git-object SQL injection. No migration/worktree SQL edit or unmerged consumer/worker enablement. Real local Auth/HTTP/RPC tests cover closed gate, current admission/retry receipt, stale versions/projection/Memory/digest, revocation, session replacement, actor isolation, CAS and scope borrowing with no provider/cost/Trip actions. Parser/identity/RPC mocks cover malformed receipts and precise mapping. Formal integrated CI follows624 merge and Main's reviewed union head; local snapshot tests are not release proof.

## Final response qualification

After the single v2 POST RPC, re-read current ordinary planning/text policy and consent; revoked/blocked returns403 and malformed503. Re-read qualified current intake with the existing authenticated reader. Only a matching new message/sequence/goalVersion/intakeRevision/intakeContextDigest can preserve current=true and both digests. Legal stale/unrecorded or a later qualified source returns only the same minimal receipt with current=false and both digests absent. Blocked/malformed never silently becomes accepted-stale. Final native session must still match. No second admission POST is issued; a failed response after a committed RPC is recovered only by the same immutable request/SQL receipt.

## Observed local checks (2026-10-03)

- PASS: parser/receipt/default-gate/session/policy/current-source adversarial tests, 33/33, 0 skip.
- PASS: actual disposable Auth → HTTP → SQL, 1/1, 0 skip; project vp-native-ask-18e76448, API64751/DB64741; owned cleanup PASS. Current checkout migrations, no Git-object injection.
- PASS: targeted source compilation/typecheck, source-policy lint and docs checks. Production build completed; combined checkpoint reruns final compilation after integration.
- Initial test-only FAIL: attempted reaccept of terminal withdrawn planning consent. Corrected by preserving the withdrawn actor and using a separate ordinary actor for text-consent withdrawal. No SQL/consent semantics changed.
- UNRUN: deployed route availability, native UI, real provider/result execution, target/device/user acceptance, full parent acceptance. Both execution flags remain false.

Reproduce: `node --experimental-strip-types --test tests/security/turn/native-planning-intake-http.test.mjs`; `node tests/integration/turn/run-planning-intake-http.mjs`. The latter refuses Docker overrides, validates owned random local project identity, loads actual migrations and cleans only its own disposable stack.
