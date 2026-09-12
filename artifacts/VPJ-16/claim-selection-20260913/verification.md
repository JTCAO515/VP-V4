# Reviewed selection renderer — repository preparation

Related to #206; no active Ask path uses this module yet. Based on main c31fd0b.
The server-owned plan supplies required statement IDs and scoped, validated authoring
records. A model may return only selected IDs. Text, all conditions and exclusions
come from the reviewed language expression, in stable server order. Source snippets
and declarations never appear in this renderer's output.

Missing required IDs remain explicit; background evidence cannot establish a complete
answer. Omitting available required evidence is a protocol failure, including a full
refusal with complete evidence. The result is an immutable projection for shared text
and card consumption, not proof of semantic retrieval or current eligibility.

PASS: six behavioral tests, source-policy lint and TypeScript check. Raw summaries are
in tests.log, lint.log and typecheck.log. No runtime entry, DB/schema, native UI or
provider transport changes; native/DB/provider execution does not apply to this pure
preparation module. Required PR CI remains pending.

Still required before runtime integration: durable request scope and idempotency;
server-owned required/background/conflict planning; exact model-recipient eligibility;
read/dispatch/complete/history revalidation; snapshot evidence bindings and expiry;
actual bilingual native/staging Ask observation. Missing coverage alone must never be
reported as a knowledge gap without distinguishing policy/provider/input/capability.
The existing first-party publication does not authorize model egress. This module
accepts internal full authoring records only for rendering; it is not a model context
serializer or a direct replacement for the localized knowledge-read/1 response.

Rollback: remove the unused module and its tests. No runtime or data state changes.
