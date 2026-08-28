# Homepage redesign — WEB-07 / #141

## Objective

Replace the stop-ship Homepage physical expression with an independent VisePanda VI composition. The page preserves the Product-preview information relationship: Chatbot proposes, Trip Canvas makes the plan inspectable, and Today presents an eligible next step or recovery path.

## Delivered surface

- The primary Homepage action is exactly `Open VisePanda` and links to the existing `/visepanda` route without sending a prompt or writing data.
- The Golden Route turns the product story into ordered planning, Canvas and evidence/recovery stages. The Guide is represented as a warm, non-authoritative companion voice; it makes no human-support, booking or live-data claim.
- The Homepage uses a plum, cream and gold VisePanda palette, a routed visual motif and a deliberately asymmetric CSS scenic frame. It ships no legacy photograph or other blocked-release media, and does not recreate the retired reference-site rhythm, clover shape or review/social-proof blocks.
- The China map is absent from the Homepage. The page is explicit that current capabilities are Early Access/product-preview material rather than real-time inventory, booking, payment or complete coverage.
- Five existing locales remain available. Switching Arabic updates `lang` and `dir="rtl"`; all navigation, CTA and FAQ controls remain keyboard-operable. Responsive styles include a 760px single-column layout and reduced-motion handling.

## Scope and exception

`tests/static-output.test.mjs` previously asserted legacy Homepage class names and implementation details. Those assertions contradicted ADR-0018's independent-redesign requirement, so this Issue replaces them with checks for the redesigned Homepage's actual invariants: exact CTA route, five-language/RTL switching, frontend-only behavior, Golden Route, ten honest FAQs, VisePanda asset locality, VisePanda tokens, responsiveness and reduced motion. This is a project-requirement correction authorized by the direct redesign instruction; it does not relax product or security checks.

## Verification

- `pnpm check` — source-policy lint, strict TypeScript, production build and 13 static output tests.
- Browser evidence covers desktop, 390px mobile and Arabic RTL. No map, prompt submission, storage write or network call is introduced by the Homepage.
- `pnpm test:e2e`, `pnpm docs:check`, asset/claim scans and final automated review remain required before merge.

## Rollback

Revert the WEB-07 commit. Do not restore a stop-ship Homepage or copy retired source expression as a fallback; show a truthful unavailable/Early Access state instead if the replacement must be withdrawn.
