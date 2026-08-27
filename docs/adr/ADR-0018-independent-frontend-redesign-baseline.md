# ADR-0018: Independent frontend product system and release gate

Status: accepted by direct operator decision on 2026-08-27 through [WEB-03 #137](https://github.com/JTCAO515/VP-V4/issues/137).

This ADR accepts the frontend architecture and release gates. It does not claim that the redesign is implemented, legally cleared, production-ready or store-approved.

## Context

The current Homepage retains substantial physical expression from a Layla clone. The current `/visepanda` workspace was accepted against a Mindtrip-derived fidelity target. Replacing names, colours or logos does not establish an independently expressed product.

The Early Access Demo is the functional reference for Today, Ask, Trip Canvas, Copilot, Tools, Explore and User, but it remains fixture-backed. It is not evidence of production AI, persistence, current data, inventory, booking, payment or Human Help.

Homepage, Login and Product currently maintain separate visual, locale, navigation and state systems. The accepted product needs one continuous frontend while preserving ADR-0003, ADR-0017, #87 and all existing Trip/Fact/Identity/RLS contracts.

This is an isolated independent rewrite, not a strict clean room: the repository and team have already seen competitor material. Evidence must therefore show independent derivation from VisePanda contracts, journeys and approved brand assets.

## Decision

1. Preserve equivalent user capabilities and information relationships while independently redrawing all physical expression. Competitor DOM, CSS, copy, imagery, fonts, shapes, proportions, component order and motion choreography are not implementation sources.
2. Treat the existing `/` Homepage and `/visepanda` as `stop-ship` until replacement acceptance.
3. Cover Homepage, invitation-only User Login, first-run, global states, the six-surface Product Shell, Profile/Privacy, mobile behavior and store-facing release evidence as one frontend product system.
4. Use only VisePanda VI + Golden Route + Guide + evidence-aware Trip cards as the new visual baseline. `brand/tokens/visepanda.tokens.json` is the design-token authority.
5. Make `Open VisePanda` the Homepage primary CTA. It performs real navigation to `/visepanda`; Toast-only or inert success is prohibited.
6. Retain Today, Ask, Copilot, Tools, Explore and User/Profile. Ask and Trip Canvas share one Trip context, but the current Mindtrip-style geometry, sidebar, fixed Composer and mobile choreography are replaced.
7. Keep the China map disabled by default. Homepage uses a non-map Golden Route until a separately accepted map compliance gate closes.
8. Retire from runtime and release trees: `public/assets/source/**`, Fig Grotesk, duplicate source-derived shapes/`vp-clover`, competitor fidelity artifacts, fixture-only success controls, and fictional/current data presented as production fact.
9. Keep #87 as the only Demo parity/maturity registry and #92 as the only Product Shell Issue. Do not create a parallel shell or maturity truth.
10. Do not activate or broaden AI, persistence, inventory, booking, payment, Human Help, SLA or city-coverage claims.

## Product and capability contracts

ADR-0003 remains mandatory: one visible Chatbot, one visible Trip Canvas, immutable `TripProposal`, visible Diff, explicit user decision, deterministic `TripPatch(expectedVersion)` and append-only audit. Clients, models, tools, Today, Explore and Memory never directly mutate Trip.

Demo fixtures may become contracts, private evals and E2E cases. They never become production seeds, fixed model answers, default profiles or live-data fallbacks.

The #87 maturity vocabulary remains authoritative: `implemented`, `contract-only`, `partial`, `fixture-only`, `planned`. A visible control has exactly three acceptable outcomes: complete the real action, show truthful unavailable/degraded behavior, or remain hidden behind capability gating.

## Shared frontend and route contract

Homepage, Auth and Product share canonical tokens/fonts, five locales (`zh/en/es/ru/ar`), correct first-render `lang/dir`, Logo/Guide primitives, focus/reduced-motion rules, capability presentation and safe route handling.

Accepted route ownership:

```text
/                                      public Homepage
/auth/sign-in                          closed-beta sign-in
/visepanda                             safe product entry
/visepanda/today
/visepanda/ask/[[...thread]]
/visepanda/trips/[tripId]
/visepanda/copilot
/visepanda/tools/[[...tool]]
/visepanda/explore
/visepanda/profile
```

```ts
type WorkspaceEntryContextV1 = {
  version: 1;
  source: "home_hero" | "home_flow" | "global_nav" | "auth";
  locale: "zh" | "en" | "es" | "ru" | "ar";
  intent?: "create" | "adjust" | "check" | "recover";
  presentation: "preview" | "authenticated";
  scenarioId?: "first-trip" | "readiness" | "build-trip" | "today-help";
  tripId?: string;
};
```

Only stable enums and owner-validated IDs enter URLs. Prompts, passport/order content, names, email, credentials and travel constraints do not enter URLs, referrers, analytics or generic logs. Anonymous preview is non-persistent, does not auto-send and does not write Trip. `returnTo` accepts only allowlisted internal routes.

ADR-0017 remains mandatory: operator-provisioned email/password only; no public signup, Magic Link, recovery, social login or MFA; failed session/`getClaims()` fails closed; user routes use verified JWT and owner-scoped RLS.

Entry resolution uses server-verifiable facts: active Trip -> Today; authenticated without Trip -> first-run/Ask; anonymous -> non-persistent Ask preview; unavailable/expired auth -> Login with safe return context.

## Mobile

Mobile is separately composed, not scaled desktop. Four frequent destinations—Today, Ask, Explore and Tools—use the primary bottom navigation; Copilot and User/Profile remain available through More/Profile. Ask keeps a compact Trip Ribbon; Canvas uses a task stack or expandable sheet instead of reproducing the old fixed dual tabs.

Acceptance covers 320, 390x844, 430x932, 768 tablet, 1280x800, 1440x900, portrait/landscape, safe areas, Back gestures, virtual keyboard, autofill/password managers, 200% zoom, keyboard focus, 44px targets, five locales, Arabic RTL, reduced motion and offline/stale/unavailable/session-expired states.

Motion preserves purpose, not competitor choreography. Route Reveal, Proposal Anchor, Guide State and entry continuity use VisePanda-owned prototypes and become immediate state changes under reduced motion.

## Brand asset and release gate

Distributed runtime/store assets are deny-by-default. Every asset needs stable ID/path, SHA-256, owner, source type/reference, licence, derivative/generation provenance, permitted surfaces, review status and approver.

- Master Logo/Panda: Homepage, Login, shell and approved store/social identity; preserve proportions, colours and Cream edge.
- Guide poses: named welcome, explanation, Tool, empty and low-risk reminder states; never replace evidence/safety/action labels.
- Utility icons: navigation/Tools/Evidence/Profile with text or accessible labels.
- Map pins: disabled until the map gate closes.
- Pattern: low-density marketing/empty-state material, never over dense data.
- UI kit: design/review reference, not production code.
- Social exports: separately reviewed marketing/store concepts, not Product UI or capability evidence.

Approved Web derivatives live under `public/assets/visepanda/brand/`; immutable owner masters remain under `assets/brand/vise-panda/`. Fig Grotesk is replaced with locally bundled, licence-recorded OFL fonts. Initial families are Baloo 2, Nunito Sans and Noto Sans.

Release is denied while any known source hash remains in public/build/store output; any brand/generated asset lacks approval; licence/SBOM/NOTICE is missing; a fixture screenshot lacks Concept/Demo labelling; a store claim exceeds implemented maturity; or map source/representation/review/allowed-use approval is absent.

Independent similarity review happens after implementation and is a risk review, never a fidelity target. Deleting current-tree source files does not rewrite Git history; history rewrite, repository migration or visibility changes require a separate operator/legal decision.

## Consequences

- This is a full frontend rewrite, not a theme swap.
- Homepage, Login and Product gain one visual, route, locale, mobile and state contract.
- Existing domain/Auth/RLS contracts remain intact; #87 owns parity and #92 absorbs Product Shell work.
- A no-map product can launch without waiting for map approval.
- Asset provenance, claim review, mobile QA and store evidence become release gates.
- The current Homepage and `/visepanda` are controlled rollback/reference material only and are not approved public/store releases.

## Rollback

Implement in isolated worktrees and Preview. Shared foundation, Homepage, Auth/first-run, Product Shell and capability slices remain independently reversible through focused commits, route cutovers or flags.

On failure, disable the affected route/capability, keep map off and return to the last release that passes the asset/rights gate. If no compliant release exists, show truthful unavailable/Early Access rather than republishing a stop-ship clone. Preserve accepted Trip, Proposal, audit, Fact, Memory, Auth and RLS data. Retired competitor assets, Fig Grotesk and duplicate shapes cannot be restored to public output as rollback.

## Supersedes

This ADR supersedes only ADR-0001's temporary legacy visual-compatibility layer and ADR-0002's legacy text-wordmark, image-slot/mask expression and bundled-font exception.

It retains Next.js App Router, React, strict TypeScript, Tailwind v4, Server Component ownership for `app/page.tsx`, explicit Client boundaries, `next/image`, `next/font/local`, project-local VisePanda assets, synchronized five locales and Arabic RTL.

ADR-0003 and ADR-0017 remain fully effective. This ADR is append-only; a changed direction requires a superseding ADR.
