# VisePanda Design QA

## `/visepanda` Chatbot Workspace

- The existing workspace keeps the VisePanda-local Canvas/POI context to the left of Chatbot on desktop, and Canvas/Chat tabs on mobile.
- Desktop 1440 × 1000, mobile 390 × 844, and Arabic RTL passed without horizontal overflow or browser console errors.
- It remains a frontend-only visual shell: no authentication, model, Trip persistence, map/POI provider, booking, or payment integration.

## WEB-01 homepage

- Accepted sources: the selected light China-map hero and commercial homepage copy direction.
- Browser review passed at 1280 × 720, 390 × 844, and Arabic RTL: the fixed transparent outline, 36 manual/cycling destination points, execution narrative, and mobile-app availability section render without overflow or console errors.
- The hero has one primary `申请 Early Access` CTA. iOS and Android are non-clickable availability indicators, not app-store controls.
- The map is an editorial abstract outline with approximate presentation points, not an authoritative map.

## Verification

- `pnpm lint` — passed.
- `pnpm typecheck` — passed.
- `pnpm build` — passed.
- `pnpm test` — passed.

final result: passed for the local frontend implementation. The Early Access destination must be configured before public release.
