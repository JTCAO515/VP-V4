# VisePanda `/visepanda` Chatbot Workspace QA

## Comparison target

- Source visual truth: `https://mindtrip.ai/chat/9273856`
- Source captures: browser-rendered desktop workspace, place/map state, destination modal, mobile chat state, and mobile Chats drawer.
- Implementation: `http://127.0.0.1:4175/visepanda`
- Route canonical: `https://go2china.space/visepanda`
- Desktop comparison: 1440 × 1000 CSS px, device scale factor 1, initial new-chat state.
- Mobile comparison: 390 × 844 CSS px, device scale factor 1, Canvas, Chat, and Chats-drawer states.

The source and implementation captures were reviewed together at matched desktop and mobile viewports in the in-app browser. Source screenshots are not retained in the repository because they are third-party reference material; implementation uses only project-local VisePanda assets.

## Intentional adaptation

The source uses a left navigation rail, a central Chat surface, and a right POI/map surface. The requested VisePanda adaptation deliberately reverses the two workspace surfaces: the Canvas and POI context are left of the Chatbot on desktop. The source's third-party travel content, Google map, illustrations, brand, and copy are not reused.

## Findings and fixes

- [P2, fixed] The first Canvas POI image generated a Next.js development LCP warning.
  - Evidence: the first desktop browser pass reported `scene-beijing.jpg` as LCP.
  - Fix: the first POI image now has `priority={index === 0}`.
  - Post-fix evidence: a fresh desktop browser tab reported zero warnings and zero errors.

No remaining P0, P1, or P2 differences are actionable for the requested VisePanda adaptation.

## Fidelity review

- **Fonts and typography:** Reuses the existing VisePanda local typeface and wordmark. The Chat title, Canvas title, compact labels, and fixed composer preserve the source hierarchy while using VisePanda’s softer purple product tokens.
- **Spacing and layout rhythm:** Desktop retains a narrow navigation rail and two large workspace columns. The Canvas/POI panel is intentionally wider than the Chat panel to satisfy the requested left-context/right-conversation hierarchy. Mobile uses a fixed header, bottom Canvas/Chat switch, and bottom-safe composer.
- **Colors and tokens:** White work surfaces, fine gray dividers, black-purple action controls, and lilac active states follow the existing VisePanda token set. The product-preview disclosure remains readable in every state.
- **Image quality and asset fidelity:** All visible imagery comes from `public/assets/visepanda/`. No third-party logo, illustration, map tile, POI image, or hotlink is used. The place view is explicitly labelled as local visual context rather than a live map.
- **Copy and content:** All new UI strings have Chinese, English, Spanish, Russian, and Arabic variants. The assistant response makes the frontend-only boundary explicit: no AI call, saved input, live map data, or Trip mutation.

## Browser evidence

- Desktop 1440 × 1000: Canvas/POI rendered left of Chatbot; list/place-view toggle, local prompt/response, POI selection, and language modal worked; `scrollWidth === innerWidth`; no framework error overlay.
- Mobile 390 × 844: Chat and Canvas tabs each rendered independently; Chats drawer opened above the fixed composer; `scrollWidth === innerWidth`; no framework error overlay.
- Arabic: `lang="ar"`, `dir="rtl"`, no horizontal overflow, Canvas and Chat surfaces remained usable.
- Fresh browser console: 0 errors and 0 warnings after the LCP fix.
- Automated gate: `pnpm check` passed with lint, strict TypeScript, production build, and 13/13 tests.

## Residual product boundary

The route is a frontend-only visual shell. It does not authenticate users, call a model, persist messages or Trip state, use a map/POI provider, or make booking/payment claims.

## Follow-up polish

- Connect the workspace only through the later frozen TurnCoordinator, TripWorkspace, KnowledgeSystem, and policy contracts; do not attach it directly to a provider or map SDK.

final result: passed
