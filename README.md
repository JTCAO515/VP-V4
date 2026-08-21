# VP-V4 — Layla.ai frontend clone

A responsive, frontend-only recreation of the public Chinese Layla.ai homepage captured on 2026-08-21.

## Run locally

```bash
npm install
npm run dev
```

Production and hosting checks:

```bash
npm run build
npm run test:sites
```

## Scope

- Responsive desktop and mobile landing page
- Local copies of the source logo, fonts, video, photography, partner marks, press marks, and portraits
- Interactive travel prompt, suggestion chips, menus, language/currency dialogs, feature carousel, video state, team cards, FAQ, cookie settings, and CTA feedback
- Frontend mock behavior only; no account, booking, payment, AI, or persistence backend

The testimonial video resources hosted by the source Firebase bucket could not be bundled. The implementation uses a project-local lavender media background generated from the captured source state; the layout, mask, and playback control remain interactive.

## Rights

Only use or publish this recreation if you own the target site or have permission to reproduce its trademark, copy, fonts, images, video, and other assets. Review the target website's terms before reuse.
