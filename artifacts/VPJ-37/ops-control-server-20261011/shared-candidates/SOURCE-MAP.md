# W2 admission → last egress → owned user alternative source map

Source base daa7bae44a660381fb3295d0d2afc327ea98d3ba (normal merge preserves private commits). All candidate shared files are full before/after/patch with hashes in pins.json.
No shared source, old migration, actor/member guard or target config is applied by this bundle.
W1 holder01a0af16-3f91-7e52-b444-c6f57f364c04 explicitly HOLD; current worker/hunk release still
belongs to Main coordination. Native current shared owner UNKNOWN; do not infer from last author.

| Existing paid path | Actual admission / source qualification | Final physical boundary / same authority | User response/read alternative |
| --- | --- | --- | --- |
| Native text current input | nativeTextHTTP→submit_text_turn; original caller session/policy/consent/Turn | runTextWorker→invokeTextProviderProtocol→authorize_text_dispatch, real dispatch_model_budget; generic HTTP recordDestination | exact OPS_* error→NativeAskStore/View; blocked original text completion; Journeys authenticated read |
| Native text task | nativeTextHTTP→submit_service_task_turn; actual service task/version/relationship | authorize_text_task_dispatch current history digest; same existing ledger dispatch | same bounded code/no fallback or retry; existing original task/read path |
| V5 assistant text/sources | nativeAssistantHTTP→submit_assistant_message_v1 / submit_assistant_message_sources_v2; exact owner/conversation/goal/version/current selected source | existing text-task worker / policy-context gates plus ledger dispatch | NativeAssistantConversationView preserves exact refusal, disables new submission while refused, opens existing Journeys |
| Grounded intent | nativeTextHTTP grounded→submit_grounded_turn; grounded_turns.city bound to same task/scope version, no HTTP override | invokeKnowledgeIntentProtocol→authorize_grounded_dispatch; dispatch_model_budget and original lease | original complete_grounded_work blocked result; NativeAskView owned Journeys/retained reviewed results |
| Grounded AI supplement (same text capability, not new mode) | Native/Web AI-assist route→grounded_ai_assist_work_v1 ensure and read_grounded_ai_assist_context_v1; original resolver must have blocked, same owner/current policy/context | runGroundedAiAssist→runGroundedWikiSearch→runWikiSearchJob→HTTP configured recordDestination every round; fresh unchanged SQL context read, then explicit OPS_SCOPE_UNAVAILABLE due to absent proved durable C2 binding | not_offered or unavailable ops_* bounded reason; SavedAnswers/NativeAiAssistStatus/View add closed reason, owned Trip/read links, no retry button |
| V1 planning | nativePlanningTaskHTTP→submit_planning_comparison_v1; actual owner/task/goal/message/version/memory basis; city unknown | planning-comparison-worker: authorize_planning_read_v1 per real AMap request; authorize_planning_dispatch_v1 after durable budget dispatch | same existing pause RPC may return closed ops_paused accounting branch, original blocked task projection; NativeAssistantConversationView Journeys |
| V2 intake planning | nativePlanningIntakeHTTP→submit_planning_comparison_v2 (actual route currently local synthetic gate); same owner/task/turn/message/source sequence/intake revision/goal version/two digests | planning-v2-bounded-worker per-request authorize_planning_intake_external_read_v1; model reservation/dispatch existing exact binding; final record_planning_intake_provider_destination_v1 | original pause RPC closed branch binds taskId/turnId/code/accounting; original task/artifact read; existing Native V5 paths, no claimed Staging intake route activation |
| Scoped Trip edit | scopedTripEditHTTP→runScopedEdit→submit_scoped_trip_edit_v1, exact current confirmed Trip version/context/scope; city unknown | executor authorize_scoped_trip_edit_effect_v1→scoped_trip_edit_budget_v1→dispatch_model_budget; hosted configured/record_scoped_trip_edit_destination_v1 rechecks | original scoped_edit_pending/1 reason gains two closed ops tokens; Native store/Sheet keeps journal, reads same operation, disables resend, closes to the same retained Trip |

Travel directions is deterministic travel_directions_v1 with no paid model budget/provider and
is not invented as a fifth paid mode. Metadata Web start_chat_turn is not assumed paid execution
merely because it has a queued row: original source/policy qualification must decide; W2 supplies
only additional denial. Cancel/withdraw/delete/source hide and existing owned Trip/artifact reads
must stay reachable independently of producer stops. No observed target/provider result here.

## Complete SQL contract dependencies for these after files

1. Two precise additional deny codes only after original authority; ordinary revocation/deletion/
   invalid proof keeps its original code. Unknown required source fails closed, no guessed city.
2. Callback/destination refusal exact {kind:'blocked',code}; pre-dispatch budget exact disabled/code
   only when same SQL transaction proves unsent state. TS never synthesizes safe-release proof from
   cached authorization; pending/dispatched and unknown acknowledgments are not released.
3. V2 reserved-only model_dispatch is unchanged and cannot be called again after dispatch. Final
   destination function gets the fresh control denial. Generic HTTP catches preserve only these
   exact bounded codes; credentials/network/raw SQL errors retain existing generic handling.
4. V1/V2 pause return union is in EXECUTION-WIRE, with ledger-derived accounting. Original task
   readback must publish fixed blocked/manual-read text without overwriting/removing an artifact or
   rerunning provider. Scoped pause keeps pending receipt, journal/operation and cost status intact.
5. Main's explicit C2 ruling preserves read_grounded_ai_assist_context_v1's original seven-key
   context (kind/turnId/city/locale/intent/inputText/placeName), completed job reads, pending and
   complete semantics. Candidate adds its exact seven-key/turn-ID decoder and repeats the SQL
   context read at every configured physical boundary. This source has no proved current job
   claim/source/actual deployment config AND original durable budget binding, so that boundary
   explicitly refuses OPS_SCOPE_UNAVAILABLE. No new provider/endpoint/contextDigest field is
   invented to fill the gap, no context read is taken as paid authority, no new ledger.
6. SQL fresh ensure and expired-running reclaim must return closed scope refusal rather than
   repeat prior unknown charged execution. Existing done/pending/complete/context reads remain.
   Local CostGuard is not persistent billing and its usage is not a model_budget_attempt. This
   unsupported paid binding remains fail closed; no normal C2 recovery is claimed. Normal four
   paid modes still use their original qualified budget/source contracts and control recovery.
7. Same-package new private helper, every exact old-function after/metadata/source count and
   qualified export/delete/restore path must accompany SQL; fullbody/holder lease remains Main.

## Candidate evidence

TS overlay checker substitutes ONLY pinned after text via compiler readFile, with original imports
and private helper. It emits no code and does not change shared files. PASS is source type evidence,
not runtime/PG/permissions or merge evidence. Swift frontend parse is syntax-only; native build,
behavioral and physical-device acceptance require the actual applied qualified package.
Main may grant only exact pins. A changed before SHA aborts; never overlay unknown concurrent dirty.
The complete applied bundle still needs affected admission/stop-CAS/idempotency/pending/fresh-city/
revocation/delete/noTrip-effect/restore and user alternative proof, plus final CI/formal review.

## Concurrent source HOLD

Historical NativeAssistantConversationView.swift before399121f9 was held and never applied. #203 has
precisely applied after9103ee2e7700daf3b31678a0b992e283f250c7bac865327cbb1218231f8e3dcf
in PR678, now normally merged into daa7bae4. The private branch could not fast-forward because
it has private commits; normal no-ff merge preserved them and all dirty without conflict. Only
this candidate was regenerated from exact merged before9103ee2e; Swift parse/patch check PASS.
JourneyEntry/materials/directions are retained. Holder lease remains HOLD; no old-before apply.

Patch format is zero-context (full before/after remain adjacent). Text-only dry check used git apply --check --unidiff-zero after exact before SHA; actual apply still needs Main lease.
