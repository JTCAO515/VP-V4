# Observable assistant experience contract

Companion to [ADR-0027](../../adr/ADR-0027-personal-journey-assistant.md). The following is the target experience, not a report of current runtime. Exact screen styling is resolved by VPJ-77 within this accepted direction; routine design decisions do not require repeated product approval.

## Navigation and capability relocation

| Surface | Job and content | Preserved entry points |
| --- | --- | --- |
| VP (default) | Continuous conversation, relevant memory, accepted work, new result and next decision | Text, permitted voice/media, attach/share intake, account entry, global search |
| Journeys / 旅程 | Goals before dates/Trip exist; selected plans, decisions, tasks and confirmed Trip | Existing Trip editor/diff/confirm, maps, Today/offline, archive/share and service assistance |
| Library / 资源库 | Tools and My materials/results, separated by an accessible switch or grouping | Translation/address tools, uploaded orders/screenshots, saved/generated artifacts, supported external handoff |
| Memory / 记忆 | What VP remembers, source, scope and correction | Existing profile-backed pace, explicit memories, pause/forget/export/delete access |
| Global search/discovery | Search external supported content and private owned resources with distinguishable groups; unqueried state can offer visual exploration | Existing Explore browse/Save/Ask/Add actions, private result/history search |
| Account sheet/page | Account, locale, notifications, privacy, purchases, export/delete and logout | Old Profile functions remain reachable; system/share deep links still route correctly |

No standalone activity feed. Task updates live with the relevant conversation/goal and a reviewable activity view. Tool availability is bound to actual capability: a Library entry cannot make eSIM sale, map navigation, voice or APNs available. Unsupported tools explain a concrete alternative without an enabled fake CTA. Old deep links map to the new destination; no raw private text in URLs.

## Three-moment storyboard

### First encounter: understand and help choose

User: “First time in China, ten days, travelling with my partner. We love food and photography, but don't want to rush.”

VP acknowledges the important constraints, produces one useful comparison or partial direction, and asks only the next material question. No compulsory exact date, Trip creation or long questionnaire. A proposed route remains conditional until applicable facts are checked. A ten-day or multi-city input must not be silently squeezed into the old 2–7-day local outline.

Show at most a small number of meaningfully different directions with appealing imagery, experience/pace/transfer tradeoffs, known assumptions and one clear action. Relevant limitations appear near affected decisions, not as a wall of internal error codes. Ordinary low-risk explanations remain answerable when live data is absent.

### Delegation: work continues while I do something else

User: “Compare the city split and places to stay. I'll come back later.”

VP states the accepted deliverable and relevant scope; the server's acceptance receipt creates the visible task. Show actual queued/running/waiting/reviewable/failed/cancelled states. The composer remains available; the user can add a condition, ask an independent question or stop work. An ambiguous “that one” is clarified only when the target cannot be resolved safely.

“No early trains this time” updates current-trip/task context, not an inferred permanent preference. A material change bumps the working basis and invalidates/restarts only affected work; old output cannot arrive as a current recommendation. App closure is not task cancellation. Worker/resource timeouts do not erase the accepted goal.

### Return: actual progress and a useful result

VP leads with a real new result or the next unresolved decision, preserving the user's prior preferences and choices. With no change, show continuity without invented activity. The same artifact ID/revision opens from conversation, journey and Library.

The user changes the route. VP explains what stays, what changes and the consequence; confirmed Trip changes remain an exact proposal/diff/confirm flow. Merely selecting a direction is not a booking or an irreversible Trip update. Restart/reconnect reads the authoritative result, not a local success placeholder.

## Memory at four touchpoints

1. Dedicated Memory tab is visible without opening account settings. First use explains how to tell VP what to remember and permits skipping; no fabricated familiarity or “understanding percentage”.
2. VP shows at most one or two **relevant** preferences when useful. Their source and current scope are accessible; irrelevant questions do not repeat badges or a user dossier.
3. Actual successful save/update triggers the existing saved/undo feedback semantics. “Remember this” with clear scope is sufficient authorization; do not ask again ritualistically. Uncertain write status never displays “saved”. Undo targets that operation/version.
4. A result can explain why it fits the user, link to the actual selected source/version, and offer “not for this task”. Record inclusion separately from verified use; a retrieved candidate alone is not evidence it influenced a result.

| Information | Authority | Correction behaviour |
| --- | --- | --- |
| Explicit stable pace/preferences | Profile for its existing fields; Memory for other supported explicitly saved facts | Revision-aware correction; never duplicate the same semantic field |
| Dates, booked/confirmed arrangements, companions for this trip | Trip and relevant material/confirmation references | Update through the proper existing path; not a memory side effect |
| “Tired today” / “early sunrise this time” | Current working context with explicit scope | Overrides the relevant temporary choice, not the permanent profile |
| Unfinished work | ServiceTask/goal progress | Resume/cancel/complete based on actual execution |
| Opening hours or transport availability | Eligible external evidence with freshness | Recheck; personal memory is not a source of external truth |

Memory page groups natural-language facts by travel style, interests, practical needs and communication preferences. Each item exposes source, applicability and edit/pause/forget controls. Sensitive attributes are not inferred from a dietary or budget request. Conflict resolution obeys the existing preference contract; do not silently remove a safety-significant requirement.

Correction/pause/forget invalidates relevant queued inputs, summaries, pending artifacts and future provider dispatches. Previously sent data cannot be described as unsent. Logging, search, exports, caches and account switching respect the same owner and deletion semantics. Subscription lapse does not withhold memory control or already delivered critical materials.

## Result forms and action semantics

| Result | Main visible content | Safe actions |
| --- | --- | --- |
| Direction comparison | A few distinct options, preferences, tradeoffs, assumptions | Select, combine, exclude, ask VP |
| Journey draft | Cities/days/experiences and supported location/time links | Edit a selection, ask impact, prepare a proposal |
| Decision brief | Recommendation, alternatives, material evidence/gaps | Accept direction, change constraints, request bounded follow-up |
| Change proposal | Exact before/after, preserved items, impact and basis | Review/confirm matching revision or keep old Trip |
| Practical artifact | Address/phrase/checklist/material summary with provenance | Display, copy/share within permission, correct/save |

Simple answers remain concise prose. Cards are used when structure helps comparison or action, not for every sentence. No arbitrary model-generated HTML, navigation or executable actions; server-validated typed content drives native components. Evidence detail expands on demand. Stale artifacts remain distinguishable from current ones and cannot offer an actionable obsolete confirmation.

## Visual, interaction and accessibility rules

- One stable panda identity and natural zh/en voice; imagery creates interest, typography and spacing establish hierarchy. Reuse approved assets/tokens when useful; resolve a single design language rather than mixing three concept illustrations.
- Show real work and deliverables, not generic “Online”, simulated typing delays, guessed percentages or busy animation without work. Motion reinforces an actual state change; Reduce Motion retains that meaning.
- Composer, task progress and result browsing are independent. New background events do not steal focus, reset scroll or interrupt editing. Screen readers announce meaningful changes, not each replay event.
- Use native Dynamic Type, contrast, minimum tap targets and logical focus order. Check small screens, largest text, long English/Chinese content, keyboard and permission/offline states.
- Voice/persona decoration does not block text use; retained navigation to privacy, logout, recovery and purchases remains discoverable.
- Discovery imagery in production must have rights and truthful place association. Generated concept scenery is not a factual destination photo.

## Experience acceptance scenarios

Extend existing Harness/UX suites; these scenario names are behaviour cases, not new tracker tickets or statistical claims.

| Case | Required observation | Explicit failure |
| --- | --- | --- |
| E1 First useful direction | Vague no-date input produces a usable direction and a material next question | Forced long form, imaginary live facts, over-refusal |
| E2 Continuous conversation | Several messages and an independent question retain correct associations | New accidental goal per message, task-wide input lock |
| E3 Delegation/restart | Accept task, close app, restart worker, return to durable result | Fake activity, dropped task, duplicate logical result |
| E4 Memory impact | Explicit saved preference changes a relevant real output, with source/version | Only a chip or setting changes |
| E5 Correction in flight | Correct/forget while queued/running; obsolete result is invalidated | Old preference revived by retry/summary/search |
| E6 Shared result | VP/Journeys/Library/search resolve the same authorized artifact revision | Copies disagree or another owner can discover it |
| E7 Confirmed change | Exact proposal review/confirmation survives reconnect and both supported clients read it | Click or generated card presented as committed Trip |
| E8 Recovery/control | Pause/cancel/revoke/expired session preserve truthful state and usable prior results | Unknown becomes success, quiet failure or blind side-effect retry |
| E9 Access and navigation | Four tabs, search, tools and account controls work in zh/en with accessibility | Old deep link dead end, inaccessible Memory, fake tool availability |
| E10 Proactivity | Accepted follow-up delivers only a meaningful, timely, scoped update | Replayed notification, stale journey, quiet-hours violation |

Record implemented, fixture-tested, target-environment observed and user acceptance separately. Observe whether a traveller can explain what VP remembers, what it is doing, how to correct it and where the result lives. Completion, useful partial, clarification, blocked and technical failure have separate denominators. No numeric improvement is presumed.
