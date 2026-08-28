# V4-01 Demo parity registry

Status: implemented governance registry; no runtime capability is activated by this document.

Issue: [#87 V4-01](https://github.com/JTCAO515/VP-V4/issues/87)

Reference snapshot: `JTCAO515/VP-Early-Access@cf6e103`

Production baseline: `JTCAO515/VP-V4@b443866`

## 1. Boundary and maturity vocabulary

The Early Access Demo is an interaction and acceptance reference. Its users, Trips, prices, POIs,
weather, provider results, memory, imports and confirmations are static fixtures. They are not
production data and are not evidence of live AI, persistence, inventory, booking, payment, current
conditions or Human Help.

| Maturity | Meaning |
| --- | --- |
| `implemented` | Current VP-V4 code and reproducible evidence implement this exact bounded behavior. |
| `contract-only` | A frozen contract/test exists, but the complete user path is not accepted. |
| `partial` | Part of the path exists; the missing boundary is named in the row. |
| `fixture-only` | Clickable prepared state in Early Access only. |
| `planned` | Owned by a dependency-gated Issue; no production capability exists. |

Flags deny capability only. The only registered R1 flags are `CHAT_RUNTIME_ENABLED` and
`TRIP_PERSISTENCE_ENABLED`. A future Issue adds its own release-slice flag only when needed; the
table never invents future flag names. JWT, server authorization and RLS remain independent.

## 2. Action registry

| ID | Demo action and fixture source | Production owner / Issue | Current maturity | Authoritative source | Failure / flag-off result | Observation | Fixture disposition and rollback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SHELL-01 | Open Today, Ask, Copilot, Tools, Explore or User from the top-level shell (`ProductDemo`) | Product Shell / #92 | `fixture-only` | Route capability registry, session and feature flags | Hide unshipped surfaces or show truthful unavailable; never expose a protected route | planned: route completion, unavailable, auth failure | `port behavior`; rollback to the last evidence-backed preview shell |
| SHELL-02 | Open a prepared feature card directly in its surface/chat (`FEATURES`) | Product Shell / #92 | `fixture-only` | Stable product route plus exact resource ID | Missing/deferred capability remains hidden or unavailable | planned: deep-link success/failure | `reuse contract/test`; retire local state as routing truth |
| SHELL-03 | Desktop split, fullscreen Demo and mobile segmented navigation | Product Shell / #92 | `fixture-only` | Responsive route state | Preserve access to the current task; no silent state loss | planned: 1280x800, 390x844, keyboard, RTL | `port behavior`; do not copy the Demo browser chrome |
| SHELL-04 | English/Chinese prepared Demo copy | Product Shell / #92 | `fixture-only` | `zh/en/es/ru/ar` production i18n | Missing locale fails build or falls back truthfully; Arabic stays RTL | planned: five-locale snapshots and overflow | `rewrite`; Demo bilingual copy is reference only |
| TODAY-01 | View one prepared next action and current conditions (`TODAY.next`, `conditions`) | Today Engine / #103, #104 | `fixture-only` | Current Trip, eligible Fact/Observation and expiry | `unavailable` or stale/recheck; cached values never appear live | planned: next-action completion, stale/unavailable | `reuse contract/test`; retire prepared weather/AQ values |
| TODAY-02 | Open delay recovery | Recovery / #105 | `fixture-only` | ExternalObservation + current Trip version | No evidence returns unavailable; Trip unchanged | planned: proposal accept/reject/conflict | `reuse contract/test`; only a Proposal may be ported |
| TODAY-03 | Open place-closure recovery | Recovery / #105 | `fixture-only` | Eligible closure observation + exact place ID | No current closure evidence returns recheck/unavailable | planned: recheck and proposal outcome | `reuse contract/test`; retire static closure as fact |
| TODAY-04 | Open queue recovery | Recovery / #106 | `fixture-only` | User observation + reviewed alternatives | No safe alternative returns clarification/unavailable | planned: clarification and proposal outcome | `reuse contract/test`; never claim live queue data |
| TODAY-05 | Open unwell recovery and official channel | Safety Recovery / #106 | `fixture-only` | User input, reviewed safety guidance and official channel | High-risk unsupported guidance fails closed to official help | planned: official-handoff selection, correction | `reuse contract/test`; no medical diagnosis or rescue claim |
| TODAY-06 | Run and expand nine Trip checks; send an alternative to Diff (`SIM_CHECKS`) | Constraint Engine / #89, Today / #103 | `fixture-only` | Deterministic constraints plus eligible evidence | Unknown inputs remain unknown; no free-form LLM verdict | planned: final-state pass/fail and corrections | `reuse contract/test`; prices/times remain fixtures |
| CHAT-01 | Start New Chat and use 11 prepared scenarios / 74 turns (`CHATS`) | TurnCoordinator / #14, #93 | `partial` — fake durable Turn contract exists; product history is absent | Durable Turn/Thread and linked Trip ID | `CHAT_RUNTIME_ENABLED=false` returns unavailable before a Turn starts | fake transcript exists; planned: reconnect/cancel/cost | `reuse contract/test`; retire fixed answers as production output |
| CHAT-02 | Choose clarification chips and continue the prepared thread | Chat Result UX / #94 | `fixture-only` | Validated `needs_input` result and durable event sequence | Invalid/stale choice returns conflict or clarification | planned: clarification efficiency | `reuse contract/test`; rewrite local step counter |
| CHAT-03 | Read Evidence, confidence and cannot-confirm fallback | Claims / #22, Chat UX / #94 | `contract-only` | Eligible EvidenceReceipt/GroundedClaim | `NO_ELIGIBLE_EVIDENCE` with official recheck/next step | planned: grounded support and unavailable honesty | `port behavior`; retire Demo confidence as eligibility |
| CHAT-04 | Copy response, request another option, or mark inaccurate | Chat Feedback / #94 | `fixture-only` | Durable feedback/correction record | Feedback failure is visible and never changes Fact/Trip | planned: another-option, correction, reject reason | `port behavior`; retire Toast-only success |
| IMPORT-01 | Step through received/parsing/extracted/checked prepared PDF states | Guide Import / #113 | `fixture-only` | Private UserArtifact with purpose, TTL and parser receipt | Partial extraction stays editable/private; no automatic Fact | planned: parse coverage, failure, TTL deletion | `reuse contract/test`; no Demo file is uploaded or imported |
| IMPORT-02 | Edit, undo or manually repair extracted fields | Guide Import / #113 | `fixture-only` | User-confirmed field revision | Unreadable fields stay excluded | planned: correction rate and retained unknowns | `port behavior`; rewrite local fixture mutation |
| IMPORT-03 | Review imported changes in Canvas Diff | Guide Conflict / #114 | `fixture-only` | UserArtifact + current Trip + eligible evidence | Conflict/unknown remains visible; Trip unchanged | planned: proposal outcome and version conflict | `reuse contract/test`; never copy extracted values into Trip directly |
| CANVAS-01 | View Timeline and expand nodes | Canvas / #15, #95 | `partial` — Trip/Proposal contracts exist; accepted browser path is blocked by #84 | Authoritative Trip snapshot/version | Missing session/Trip returns unavailable, not fixture fallback | planned: reload consistency and node trace | `port behavior`; rewrite fixture projection |
| CANVAS-02 | View schematic Map | Canvas Place / #96 | `partial` — owner-scoped exact/user references and a labelled no-provider schematic exist; no canonical content or map provider is accepted | TripPlaceReference/UserPlaceRef + licensed map or schematic | No provider keeps a labelled schematic; no live-route claim | exact-ID owner scope and provider-unavailable are covered statically; runtime RLS evidence awaits local Supabase | `port behavior`; retire Demo coordinates as geography |
| CANVAS-03 | View Bookings actions | Reservations & Actions / #97 | `fixture-only` | UserArtifact, official channel and Trip action projection | No order/payment/inventory; stale action shows recheck | planned: action projection state | `rewrite` as Reservations & Actions; retire booking claim |
| CANVAS-04 | Open Diff, accept/reject/rework or select changes | Canvas / #15 | `partial` — immutable Proposal and atomic RPC exist; UI/session acceptance incomplete | Exact Proposal revision and Trip base version | `TRIP_PERSISTENCE_ENABLED=false`, unauthorized, stale or conflict returns no write | remote CAS/fault evidence exists; planned: browser decisions | `port behavior`; retire local state application |
| CANVAS-05 | View versions and request rollback | Canvas / #95 | `fixture-only` | Append-only Trip versions and audit | Rollback creates a new version; never rewrites history | planned: version/reload/rollback trace | `reuse contract/test`; rewrite local version selector |
| CANVAS-06 | Trigger a node action or official handoff | Canvas Actions / #97 | `fixture-only` | ActionProjection / typed Card / Proposal | Provider unavailable retains address/recheck action | planned: action success/unavailable | `port behavior`; retire Toast-only completion |
| MEMORY-01 | Browse 12 prepared memory items, source and impact | Memory Contract / #98, Copilot / #99 | `partial` — owner-scoped profiles, sources and recorded receipt impacts render only after a durable read | Explicit/confirmed MemoryReceipt under owner RLS | Missing consent/source returns candidate, paused or unavailable | static owner/read evidence; local/runtime trace unrun | `reuse contract/test`; retire fictional traveler profile |
| MEMORY-02 | Confirm, reject, pause, forget or edit memory | Copilot / #99 | `partial` — owner-JWT governance writes reload from durable state | Durable owner action and audit | Failure stays visible; UI never pretends deletion/confirmation | static action/reload consistency; local/runtime trace unrun | `port behavior`; rewrite local state buttons |
| MEMORY-03 | View before/after Trip impact | Memory Consumers / #100 | `partial` — receipt projection exists but no current Turn/Proposal writer records an impact | Concrete MemoryReceipt -> Proposal/Trip origin | Paused/rejected memory cannot affect new Turns | static receipt contract; writer/runtime trace unrun | `reuse contract/test`; no inferred item becomes a hard constraint |
| TOOL-01 | Browse five Tools and their 34 prepared sub-screens | Tool Gateway / #88, Tool Surface / #107 | `fixture-only` | Closed Tool contract, policy gateway and receipt | Health is healthy/degraded/offline; flag is not authorization | planned: tool selection/final state/error | `reuse contract/test`; rewrite local screen index |
| TOOL-02 | Read menu, translate, show Chinese ordering/allergy card and TTS | Media/Translate / #32–#36, Safe Phrase / #108 | `fixture-only` | Approved media/translation or deterministic Safe Phrase | Critical text unavailable/recheck; TTS must equal displayed text | planned: OCR field exactness, correction, TTS equality | `reuse contract/test`; retire prepared recognition result |
| TOOL-03 | Confirm pickup point and open ride-provider handoff | Ride Assist / #109 | `fixture-only` | User-confirmed location/address + provider handoff | No代叫, payment, partnership or live price claim | planned: pickup correction and handoff | `port behavior`; retire fixture price/provider state |
| TOOL-04 | Check scoped visa/regulation guidance | Visa Tool / #110 | `fixture-only` | Scoped reviewed Policy Fact + official channel | Insufficient/expired scope returns recheck/unavailable | planned: scope/expiry/correction | `reuse contract/test`; no legal guarantee |
| TOOL-05 | Prepare network/eSIM/local-number checklist | Network Tool / #111 | `fixture-only` | Reviewed Guide/Fact | No unreviewed coverage/price; unresolved items stay unknown | planned: checklist/proposal outcome | `reuse contract/test`; retire fixture coverage |
| TOOL-06 | Generate a Human Handoff pack | Handoff Pack / #112 | `fixture-only` | Current Trip/context selected by user | Without operator capacity, generate copyable pack only; no message is sent | planned: pack generation and official-channel use | `port behavior`; retire real-time Human Help claim |
| EXPLORE-01 | Select city/category/area, filter price/international card/English, reset | Explore / #29, #92 | `fixture-only` | Eligible Explore projection from Canonical POI/Fact | Empty result is truthful; no static seed fallback | planned: filter result and no-leak suites | `reuse contract/test`; retire Demo POI/price as production seed |
| EXPLORE-02 | Open POI detail and inspect evidence/capabilities | Explore / #29, #96 | `fixture-only` | Exact Canonical POI ID + fact-level receipts/expiry | Unknown/expired capability is labelled; no generated field | planned: fact freshness and correction | `port behavior`; fixture media/reviews remain non-production |
| EXPLORE-03 | Ask VisePanda about the exact POI | Explore Ask/Add / #30, Chat / #94 | `fixture-only` | Exact POI ID carried into ContextPlan | Missing eligible facts returns clarification/unavailable | planned: exact-ID Ask trace | `reuse contract/test`; never reparse card text into identity |
| EXPLORE-04 | Add POI to Trip | Explore Ask/Add / #30 | `fixture-only` | Exact POI ID -> immutable Proposal -> Canvas confirm | No direct Add/write; flag-off or conflict keeps Trip unchanged | planned: proposal/apply trace | `rewrite`; retire Toast-only Add |
| USER-01 | View/edit account and save | Auth / #84, Profile / #101 | `partial` — durable explicit Profile route/UI; real-session runtime acceptance incomplete | Verified user JWT + owner RLS | Unauthorized/expired session returns five-language auth failure | static owner/reload/locale-unit; runtime reload pending | `rewrite`; retire fictional Michael Turner account |
| USER-02 | View Travel Profile, Memory and Preferences tabs | Profile / #101, Memory / #98–#100 | `partial` — explicit Profile preferences are durable and separate from Memory; combined Demo tabs are not ported | Explicit settings separated from Memory | Missing Profile is a neutral unsaved form; no inferred setting masquerades as explicit | static owner/reload/locale-unit; runtime reload pending | `port behavior`; retire fixture defaults |
| USER-03 | Export or delete privacy data | Privacy / #102 | `fixture-only` | Owner-scoped export/delete workflow and receipts | Failed/partial deletion never displays success; backup exception is visible | planned: export/delete/retention proof | `reuse contract/test`; retire local confirmation toggle |
| OFFLINE-01 | Read saved Trip, address and Safe Phrase in prepared offline state | Offline / #115 | `planned` | Encrypted/user-isolated cache of already accepted content | Offline never appears live; logout/delete clears user cache | planned: device/cache isolation/expiry | `reuse contract/test`; no offline cache exists yet |

## 3. Fixture package disposition

| Demo asset | Count | Disposition | Production prohibition |
| --- | ---: | --- | --- |
| Chat scenarios / turns | 11 / 74 | `reuse contract/test` for multi-turn, clarification and failure corpora | No fixed model answer or fictional user history |
| Canvas documents / Diff entries | 11 / 12 | `reuse contract/test`; `port behavior` through Trip/Proposal projection | No production Trip seed or client-side write |
| Memory items | 12 | `reuse contract/test` for lifecycle/scope/abstention | No default traveler profile or automatic hard constraint |
| Tool screens | 34 | `reuse contract/test` for health/error/approval; `rewrite` providers | No provider-connected, price, service or completion claim |
| City / POI states | 4 / 9 | private staging/eval fixtures only | No production Knowledge seed, media, review or capability claim |
| Recovery paths / checks | 4 / 9 | `reuse contract/test` for deterministic rule and Proposal cases | No LLM free decision or live condition inference |
| Import PDF and extracted fields | 1 / 5 | `reuse contract/test` for partial/correction/conflict | No real upload, persistence or automatic Fact promotion |
| Fictional account, Trips, prices and weather | multiple | `retire` from production data and public proof | Never represent as a user, current price, inventory or live condition |

## 4. Release rule

A row may move to `implemented` only when its owning Issue supplies the required contract/runtime,
negative and degraded cases, L1–L7 evidence applicable to its risk, truthful UI maturity, observation
owner/window and rollback. A merged planning PR, Vercel preview or clickable fixture is not sufficient.
