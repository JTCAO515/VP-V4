# Shared native result basis — 2026-10-02

Related to #560 / #564; #560 remains OPEN. Implementation base `d3d9f76b26066961fb4b8dce17ebb3f6a80c056e`. Rebased without conflict onto `3f97270071ea631ccde02038cb4cfb74a3d70901` (#604/#605 do not overlap the owned shared Knowledge section).

## Scope and receipt boundary

Only the shared result model/store/card section in `NativeKnowledgeView.swift`, dedicated additions to `NativeKnowledgeTests`, and this evidence change. Library, selected Trip and Journeys reuse the same card. Translation v2 pagination/search/query adapters, Ask, shell, project registration, production fixtures, Web, SQL and writer/confirmation payloads are untouched.

The existing body reader decoded only Trip association. Optional decoding now retains full source, basis, creation time and read/current-revision flags. Facts require complete closed source keys and basis keys, valid UUIDs/positive recorded versions, at most 20 Memory references, explicitly empty evidence, supported comparison schema, readable revision and valid timestamp. Missing/old/unknown metadata displays an unknown-basis explanation; it never becomes fabricated zero references. Malformed typed data fails the existing read safely.

The first disclosure explains recorded saved Trip version, input sequence, Memory reference count/revisions, and unknown evidence verification/freshness and causal influence. It does not infer preferences, source contents, task titles or reasons from IDs. Zero references means no recorded references. Currentness applies to this read; historical reads explicitly describe an earlier saved revision. Identity/task-turn UUIDs and creation timestamp live in a second disclosure.

`visibleResult` is the shared body/basis scope, monotonic deadline and selected-Trip gate. Basis has no independent cache or request. Existing generation/clear and callers' periodic/background/session/navigation fences remain. Disclosure state is owned by SwiftUI and reset with body removal or artifact/revision change. Each disclosure uses a full-row native button with a 44-point minimum height and localized expanded/collapsed value.

## Local verification

- PASS: iOS 17.5, isolated iPhone 15 Pro simulator `DC7ABBDD-3E51-4CCF-8043-A901B6453471`; affected `NativeKnowledgeTests` 32/32 on the rebased final implementation, including the final revision/readability regressions (ad-hoc signed build included). `pnpm docs:check` and diff checks PASS.
- New cases: zh/en zero/two recorded references; no ID-derived copy; missing source/basis/fields versus empty arrays; unknown schema, unknown evidence and extra basis fields; invalid Memory IDs/counts, sequence/date; current versus historical copy; scope/actor/inactive/Trip/30-second boundary/clear/late-response gates. Dedicated maximum Dynamic Type rendering at 320×568 validates vertical scrolling without horizontal overflow and saves folded screenshots.
- PASS: external Simulator UI snapshots and native button taps observed English `Collapsed` → `Expanded` and Chinese `已折叠` → `已展开`; scrolled authorized synthetic test receipts display zero English references and two Chinese references v1/v4, with unknown evidence and influence copy. UUIDs are absent from the main basis surface. The second disclosure was styled explicitly to retain the same full-row button semantics.
- Screenshots: [English folded maximum text](en-folded-max.png), [Chinese folded maximum text](zh-folded-max.png), [English expanded maximum text](en-expanded-max.png), [Chinese expanded maximum text](zh-expanded-max.png). Expanded captures are synthetic unit-host windows over the app shell; the visible underlying shell is not Library/Journeys end-to-end acceptance. These are UI-local test receipts, not real producer/target results.
- Earlier internal AX traversal could not retrieve SwiftUI proxy nodes; the probe was replaced by external system snapshots. A later local second-disclosure probe was interrupted when the isolated simulator shut down; the simulator was restored and normal final regression ran. No production behavior or permission gate was weakened. Temporary 60-second probe waits are removed from committed tests.

Existing effective HTTP/permission evidence is reused because no transport, auth, SQL or policy interface changes. Applicable CI runs on final PR head; review/merge remains with main.

## UNRUN

Physical VoiceOver, real Staging/provider/device/production, and whole #560/#564 acceptance. No target write, paid operation, deployment or new provider request was performed. Expanded second-level UI interaction is not claimed from the interrupted probe; its SwiftUI button semantics and shared read gate are covered by code/build and relevant CI.
