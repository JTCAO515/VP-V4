# SIM Ask — scoped staging and native results; acceptance gaps remain

Three obligations add ordinary mainland carrier SIM application documents/outlets, call/data
allowance checks, or both to the existing classified-then-reviewed answer path. No facts or
source text go into the classifier. Cross-domain and unsupported additional needs remain partial.

Readiness only: operator SQL observed both existing SIM facts published through September 19;
this is not a product retrieval acceptance. The original official SIM section was rechecked
on September 13: https://english.www.gov.cn/2025special/bizexpatsinchina2025 (Daily Life Services,
I. SIM card, paragraphs I–II and plan note). No new publication occurred. The staging definition migration described below is now applied.

PASS: actual isolated PostgreSQL question suite 11/11, grounded task suite 13/13, zero skips.
Includes migration transaction rollback, exact scene/relation filtering, honest missing/revoked
and conflicting support, role denial, dispatch requirement, owner isolation, frozen historical
gaps and immutable terminal intents. PASS: 273 full contract tests, 22 static tests, unsigned
native build, Web build and 12 native knowledge XCTest cases with zero failures/skips.
Security: 146 pass, zero fail, 1 existing dedicated database-environment skip; incomplete for
that skipped gate. Independent migration/shared-contract review: 0 Critical / 0 Important.

The append-only migration changes only the private definition and intent CHECK. It was created
with Supabase CLI and its unapplied version set after the existing 090000 migration to preserve
execution order. No applied migration changed. New fixed classification cases: 44 zh/en cases
in tests/fixtures/knowledge/connectivity-intent-v1.json, frozen before provider calls.

PASS: actual Staging43→44 upgrade, after encrypted backup and isolated full restore.
All 78 original table digests were preserved; 261 original schema/permission entries were
checked, with only the expected question-definition function changed. All 11 definitions
and the expanded intent constraint match the frozen migration. Ops and default reader remain
disabled, no active Ops members, existing publications and role/RLS/RPC boundaries preserved.
Security advisor retrieval was unavailable because the connector denied permission; the
direct ACL/RLS checks passed and do not substitute for the unavailable advisor result.

Actual evaluation: 86/86 unique frozen cases matched (44 SIM +42 legacy payment/rail).
This was not uninterrupted: initial70 plus resumed16, with87 actual provider attempts including
one paid session-replacement interruption. Recorded estimated debit879072 CNY micros; not an invoice.
See evaluation-aggregate.json and runtime-interruption.md. Original failure remains recorded.

Actual signed native Simulator UI: two frozen exact-input submissions completed, English full
SIM guidance with two claims and Chinese document guidance with one claim plus explicit unanswered
eSIM scope. Ordinary reload, persisted results and normal bilingual logout observed. SQL corroborates
both completed work rows and settled attempts,20556 additional CNY micros;0 unresolved globally.
Initial unsent English draft was corrupted by Simulator Chinese IME and replaced before submission;
no provider reroll. Initial native audit queried budget by Turn instead of attempt identity; corrected
read-only query passed, with the original checker failure preserved.

Actual en/zh desktop and390x844 Web readback passed for API-generated native-protocol tasks,
including content, sources, owner isolation and reload. Web readback of these two actual native UI submissions now passed in both locales,
at1365x900 and390x844, with original language/claims/sources/reload and Chinese-owner
English-request exclusion. Both Web accounts signed out; temporary viewport reset and tab closed.
See web-native-acceptance.json. Native source disclosure content was read in accessibility snapshots;
a stable visible source view was interrupted by periodic evidence rechecking. Screenshot names
are raw capture points, not assertions that all source details were visible.

Observed defects: cancelled stale work still projects accepted/pending (#264), and native periodic
rechecking temporarily removed answer content and disrupted source expansion at8de8c9b.
The native-only follow-up begins accepted-consent refresh5s before the existing deadline, without
extending that deadline.22 focused native tests passed after recovering a Simulator launch failure;
signed staging build/codesign passed.40.76s live source reading produced18 successful AX samples
and stable before/after screenshots (not continuous-frame proof), no new model calls.
The cancelled-work status defect remains unresolved; independent pre-review identifies the necessary
SQL+SSE correction and adversarial cases in cancelled-read-pre-review.md.
No full SIM experience acceptance claim. Full #206/#264/S2 and physical-device/release checks remain open.
Cleanup: reader/Opsfalse,0 active members,12statements/11published/1revoked unchanged; owned WAF host
removed at version60, window exit0. Two native users signed out. Runtime remains frozen8de8c9b.

Follow-up cleanup: native/Web accounts signed out, reader/Opsfalse,0 active members;
owned WAF removed at version62, readback window exit0. Existing publications/users/Trips unchanged.
