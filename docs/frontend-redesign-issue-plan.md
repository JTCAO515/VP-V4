# VP-V4 complete frontend redesign Issue plan

Status: local execution plan; current remote GitHub Program and Issue status is unverified. Local implementation evidence is merged through WEB-10.
Date: 2026-08-27.
Parent: [WEB-02 #136](https://github.com/JTCAO515/VP-V4/issues/136), under [AI-00 #2](https://github.com/JTCAO515/VP-V4/issues/2).
Decision baseline: [ADR-0018](adr/ADR-0018-independent-frontend-redesign-baseline.md).

## 1. Objective and boundary

Deliver one independently expressed frontend across Homepage, closed-beta Login, first-run, the six-surface Product Shell, mobile/global states, Profile/Privacy and store release. Functional and information relationships remain equivalent to the accepted VisePanda product; physical expression is independently redrawn from VisePanda VI + Golden Route + Guide.

The current Homepage and `/visepanda` are stop-ship. Map is off by default. `Open VisePanda` is the Homepage primary CTA.

This plan reuses [#87](https://github.com/JTCAO515/VP-V4/issues/87) as Demo parity truth, updates [#92](https://github.com/JTCAO515/VP-V4/issues/92) as the only Product Shell, and reuses #93-#116 for production capability slices. It does not import Demo fixtures or create a second Auth, Trip, Fact, Memory, provider or capability source.

## 2. Published mapping

| Plan | GitHub Issue | Phase | Initial status | Outcome |
| --- | --- | --- | --- | --- |
| Program | [#136 WEB-02](https://github.com/JTCAO515/VP-V4/issues/136) | R0-R5 | in progress / human-owned | Complete frontend redesign program |
| F0 | [#137 WEB-03](https://github.com/JTCAO515/VP-V4/issues/137) | R0 | merged locally | ADR, numbered DAG, tracker and handoff freeze |
| F1 | [#138 WEB-04](https://github.com/JTCAO515/VP-V4/issues/138) | R0 | merged locally | Asset quarantine, rights ledger, fonts, SBOM/NOTICE |
| F2 | [#139 WEB-05](https://github.com/JTCAO515/VP-V4/issues/139) | R0 | implemented locally under direct operator selection | Three VI directions and selection/dissent record |
| F3 | [#140 WEB-06](https://github.com/JTCAO515/VP-V4/issues/140) | R1 | merged locally under the accepted dependency waiver | Shared tokens, brand, locale, motion and primitives |
| F4 | [#141 WEB-07](https://github.com/JTCAO515/VP-V4/issues/141) | R1 | merged locally | Homepage independent rewrite and Open VisePanda entry |
| F5 | [#142 WEB-08](https://github.com/JTCAO515/VP-V4/issues/142) | R1 | merged locally | Closed-beta Login, first-run and global auth states |
| F6 | [#92 V4-07](https://github.com/JTCAO515/VP-V4/issues/92) | R2 | merged locally | Existing Product Shell |
| F7 | [#143 WEB-09](https://github.com/JTCAO515/VP-V4/issues/143) | R2 | merged locally | Entry context, locale and auth continuity |
| F8 | #93-#116 | R2-R5 | existing DAG | Demo parity production capability slices |
| F9 | [#144 WEB-10](https://github.com/JTCAO515/VP-V4/issues/144) | R2 | merged locally | Mobile, accessibility, motion and global-state acceptance |
| F10 | [#145 WEB-11](https://github.com/JTCAO515/VP-V4/issues/145) | R5 | pending external release evidence | IP, map, store and Production cutover gate |

## 3. Dependency graph

```mermaid
flowchart TD
  P["#136 WEB-02 Program"] --> B["#137 WEB-03 ADR baseline"]
  B --> A["#138 WEB-04 assets and rights"]
  B --> V["#139 WEB-05 visual directions"]
  A --> F["#140 WEB-06 shared foundation"]
  V --> F
  F --> H["#141 WEB-07 Homepage"]
  F --> I["#142 WEB-08 Login and first-run"]
  H --> I
  F --> S["#92 V4-07 Product Shell"]
  I --> S
  H --> C["#143 WEB-09 continuity"]
  I --> C
  S --> C
  H --> Q["#144 WEB-10 frontend acceptance"]
  I --> Q
  S --> Q
  C --> Q
  Q --> R["#145 WEB-11 release gate"]
  E["#116 Full Product Parity"] --> R
  G["#43 R5 Hardening"] --> R
```

Native sub-issue and dependency links are authoritative. Every body retains textual `Blocked by #N` for portability.

## 4. Ownership and WIP

- #136 is an in-progress program sub-issue of #2. #137-#145 are sub-issues of #136.
- Only one Issue may own a path at a time. #138 owns removal/licence/asset checks; #140 consumes only approved assets.
- #92 continues to own `app/(product)/**` and `components/product-shell/**`; no WEB Issue creates a second shell.
- #93-#116 retain Chat, Canvas, Memory, Today, Tools, Explore, User, Privacy, Offline and final-parity runtime ownership.
- #57 is superseded by #141. Its map-first local Preview does not authorize production.
- PR #124, which applied VisePanda assets to the old stop-ship Landing/Chat surfaces, was closed as superseded. Approved derivatives may be reused only through #138/#140 after review.
- One Issue = one branch = one reviewable PR; no stacked PRs on unmerged work.

## 5. Frontier rules

After this baseline reaches `main` and #137 closes:

- #138 becomes `status:ready` + `ready-for-agent`.
- #139 becomes `status:ready` + `ready-for-human` because operator selection is part of acceptance.
- #140 remains blocked until both close.
- #92 remains blocked by its existing #91 dependency plus #140/#142.
- Later Issues remain blocked until every native dependency closes.

No frontend child may fall back to Demo fixture success, blocked source assets, map-on behavior or competitor fidelity to appear complete.

## 5.1 Local execution snapshot — 2026-08-28

`main` contains WEB-03 through WEB-10, including WEB-05's direct operator selection record. An operator-inserted isolated Homepage refinement may replace `/` and relocate the earlier long-form landing to `/homepage`; it remains subject to the same ADR-0018 CTA, map-off, asset, locale and release boundaries.
The selected baseline is VisePanda VI + Golden Route + Guide, with `Open VisePanda` as the
primary CTA and the map disabled by default. This does not waive any release or asset-rights gate.
Remote GitHub status synchronization is not
asserted here: the local `gh` client is unauthenticated and GitHub's anonymous API is rate-limited.
The V4-22 through V4-30 truthful unavailable/degraded frontend boundaries are also merged in
`main`; no locally executable frontend implementation Issue remains after WEB-05.
WEB-11 remains a release-evidence and operator-decision gate, so it is skipped until its
external prerequisites exist.

## 6. Required release evidence

- source/hash denylist, rights ledger, font licences, SBOM and NOTICE;
- three independent visual directions and operator selection record;
- five locales, Arabic RTL, keyboard, screen-reader labels and reduced motion;
- 320, 390x844, 430x932, tablet, 1280x800 and 1440x900 evidence;
- Login/session/returnTo/privacy negative paths;
- truthful implemented/degraded/unavailable/hidden capability behavior;
- #87 parity registry freshness and #116 full-product evidence;
- store screenshot claim matrix, map-off/map-on decision evidence;
- Preview smoke, cutover/rollback rehearsal, owner and observation window.

## 7. Rollback

Each implementation Issue is independently reversible. Before cutover, keep a compliant evidence-backed production route as rollback. If no compliant prior release exists, show truthful unavailable/Early Access rather than republishing either stop-ship surface. Frontend rollback never rewrites accepted Trip, Proposal, Fact, Memory, Auth, RLS or audit data.
