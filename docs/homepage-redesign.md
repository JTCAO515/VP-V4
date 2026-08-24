# Homepage redesign: fixed China destination map

Status: `implemented preview` once [WEB-01](https://github.com/JTCAO515/VP-V4/issues/57) passes its checks; not a statement of production data availability.

## Objective

Present VisePanda's China-travel planning and execution positioning through the selected light map hero and a concise four-part narrative: trip check, preparation, Trip Canvas, and Today moments. FAQ, the mobile-app availability section, and the footer follow the same system.

## Conversion contract

- The homepage has one primary conversion action: `申请 Early Access` / `Apply for Early Access`.
- The CTA opens a hosted Jotform email application in a new tab through `NEXT_PUBLIC_JOTFORM_EARLY_ACCESS_URL`.
- Jotform was selected because its [official support response](https://www.jotform.com/answers/5426376-service-coverage-issues) states that `jotform.com` is accessible in China and lists alternative form domains; the final public URL remains an operator-owned configuration.
- The iOS and Android cards are non-interactive availability indicators. They do not impersonate App Store or Google Play download controls.

## Outline asset and public-release boundary

- Runtime asset: `public/assets/visepanda/china-outline-preview-v4-transparent.png` (SHA-256 `6b180d9160715b7d0ea2711785dfdcf1deb1304cb72b1b5814b44539aac7351e`).
- It is a transparent, generated abstract outline used as an editorial visual. It has no administrative boundaries, labels, inset maps, or authoritative map content.
- Destination coordinates are approximate visual positions, not a navigation, geocoding, or location service.
- The marker overlay is a local product-preview treatment only. Public release still requires the operator to determine whether the final visual requires map review; this preview does not claim approval.

## Interaction contract

- 36 destination-preview markers: one representative destination in each provincial-level region, including Hong Kong, Macao, and Taiwan, plus Shenzhen and Jiuzhaigou. They all use the same point, cycle, click, and callout interaction.
- One marker is active at a time. Motion-enabled browsers choose a non-repeating random next marker every five seconds.
- A visitor can select any marker manually. The small callout contains only destination, sample featured place, and a truthful weather-unavailable label.
- `prefers-reduced-motion` leaves a stable initial destination selected.

## Maturity and anti-goals

- All featured-place labels are presentation samples, not reviewed operational Facts or an Explore catalogue.
- Weather is intentionally unavailable; no provider, API, cache, or current observation is connected.
- The page does not add AI, Trip persistence, booking, payment, inventory, Human Help, or complete real-world coverage.
- The flow, information rail, workspace and Today panels are code-native product previews. They explain an intended interaction boundary; they are not connected to an AI, live facts, a saved Trip, or a provider.

## Rollback

Revert WEB-01's landing composition and remove the added map asset. No database, provider, or user data changes exist.
