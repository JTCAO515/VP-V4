# VisePanda Travel AI VI System — Design Specification

**Status:** Approved concept; awaiting specification review

**Date:** 2026-08-27

**Owner:** VisePanda
**Source assets:** `assets/brand/vise-panda/VP-Logo.svg`, `VP-Logo.png`, `VP-正面全身.png`, and `VP-三视图.png`

## 1. Objective

Create one cohesive visual-identity system for **VisePanda**, an English-language AI travel companion that helps international visitors travel around China with confidence. The system must make the supplied panda-and-phone logo feel like a warm local friend: easy-going, delighted to help, recognisably Chinese, and never cold or overly technical.

The final delivery comprises a concise, production-ready brand guide plus reusable assets for social media, marketing web pages, and a mobile app.

## 2. Scope and anti-goals

### In scope

- Brand foundations: positioning, verbal tone, colour, typography, grid, spacing, outline and shadow rules.
- Logo guidance: lockups, clear space, minimum sizes, background use, and misuse examples.
- Panda IP system: an expression/action library and usage rules derived from the supplied character.
- Illustration and icon language: destinations, navigation, travel utilities, and decorative motifs.
- Digital components: app/web colour tokens, icons, map pins, buttons, cards, AI conversation, loading, and empty states.
- Social kit: profile/avatar, post, Story, short-video cover/end-card, and campaign-poster templates.
- Brand guide provided in English, with Chinese place names permitted where relevant to travel content.

### Anti-goals

- No redesign or replacement of the supplied logo or mascot.
- No generic neon, cyberpunk, glossy 3D, luxury-black, or corporate-SaaS visual language.
- No use of Chinese cultural symbols as undifferentiated decoration; landmarks must be contextual and travel-relevant.
- No final brand claim implying official government, transport, visa, emergency, or booking authority.

## 3. Audience, promise, and personality

| Area | Decision |
| --- | --- |
| Primary audience | English-speaking international visitors planning or taking a trip to China. |
| Core promise | **Your warm local friend in China.** |
| Brand role | A cheerful travel buddy who explains, recommends, and gently guides. |
| Voice | Clear, upbeat, encouraging, compact, and culturally respectful. |
| Emotional outcome | “China feels exciting and manageable; I know who to ask.” |

Suggested support lines: **Plan less. Feel more.** / **China, made easy.**

## 4. Visual direction

### 4.1 Defining characteristics

- Korean-inspired minimalist flat illustration with a relaxed hand-drawn line.
- A rounded, happy panda holding a phone remains the visual anchor.
- Cream-white sticker edging separates shapes from rich purple ground fields.
- Vintage dark gold plus plum purple creates the recognisable colour signature; butter yellow supplies moments of welcome and discovery.
- Simple, high-contrast forms keep the system legible on small app screens and social thumbnails.

### 4.2 Colour system

The exact source values will be sampled from the approved logo before production. The working roles below define the system; their values must be contrast-checked before release.

| Token | Role | Working value |
| --- | --- | --- |
| `VP-Plum-900` | Primary brand field, headings, ribbons | `#64213F` |
| `VP-Plum-700` | Secondary field, chips, illustrated mountains | `#873D62` |
| `VP-Gold-800` | Keyline, navigation and premium emphasis | `#85611C` |
| `VP-Gold-500` | Buttons, routes, discovery highlights | `#F2AE46` |
| `VP-Butter-100` | Warm background and light highlight | `#FFF4C8` |
| `VP-Cream-50` | Sticker border, cards, reverse type | `#FFFDF4` |
| `VP-Ink-950` | Panda patches, outlines, primary text | `#1D1215` |

Default composition: Cream 45%, Plum 25%, Ink 15%, Gold 10%, Butter 5%. Text on plum/ink must use cream; small text uses ink on cream or butter. Gold is an accent, never the sole carrier of essential information.

### 4.3 Typography

- Display: **Baloo 2 SemiBold** (friendly, bouncy, broad counters), or the closest licensed equivalent.
- UI and body: **Nunito Sans** Regular–Bold (clear at small sizes, soft terminals).
- Place names: allow **Noto Sans** as a multilingual fallback, maintaining the same hierarchy.
- Avoid condensed, geometric-tech, high-contrast serif, and brush-script treatments.

### 4.4 Layout and materials

- Base grid: 8 px digital spacing scale; 12-column desktop and 4-column mobile layout.
- Corner radius: 16 px standard / 24 px feature cards / pill for filters and labels.
- Outline: cream sticker edge outside a 2 px ink keyline at 1× digital scale; scale proportionally.
- Shadow: one offset, plum-tinted shadow at 12–16% opacity. No diffuse glass or gradient-heavy surfaces.

## 5. Logo system

- The source SVG is the master mark and is never redrawn, traced, recoloured arbitrarily, squeezed, cropped, or used with substituted type.
- Master lockup: full panda, phone, lower VisePanda ribbon, and `go2china.space` ribbon.
- Derived digital avatar: head-and-phone crop, retaining at least one complete eye and a cream sticker outline.
- Clear space: at least the panda eye diameter on every side.
- Minimum size: master lockup 120 px wide on screen / 32 mm in print; avatar 32 px on screen.
- Approved grounds: Cream, Butter, Plum-900, or Ink-950. On dark grounds, preserve its cream outline; never add a second drop shadow.

## 6. Panda IP system

The existing panda is treated as the **VisePanda Guide**, not a separate brand character. New poses keep its round proportions, dark-brown/ink patches, wide delighted eyes, open smile, cream outline, and low-detail hand-drawn finishing.

| State | Primary use | Visual cue |
| --- | --- | --- |
| Welcome | onboarding, social profile | open hand, phone displayed |
| Guide | itinerary and maps | pointing at a route or destination card |
| Recommend | food and hidden gems | holding a small sign or snack; delighted eyes |
| Transit | route updates | standing beside a train/metro cue |
| Translate | phrase help | chat bubble and small speech card |
| Celebrate | trip completion, share cards | raised phone, subtle confetti |
| Gentle alert | missing data, time-sensitive advice | sympathetic face, small amber notice—not alarm red |
| Rest | loading and empty states | curled pose with a tiny travel bag |

Do not depict the panda in potentially unsafe travel situations, as an official authority, or with specific ethnic costume as shorthand for China.

## 7. Illustration, icon, and pattern language

- Hero illustrations combine a contained scenic “window”, simplified landmark silhouette, hand-drawn cloud, and curved Gold route.
- Landmark examples: Great Wall, Temple of Heaven, West Lake, Zhangjiajie, Shanghai skyline, Xi’an City Wall. Match context to the actual destination.
- Utility icons use rounded ends, 2 px Ink stroke, Cream fill when needed, and one Gold detail maximum.
- Core utility set: itinerary, map, save, transport, translation, food, stay, currency, weather, safety, chat, and share.
- Micro-pattern: travel tickets, tiny clouds, leaves, bamboo dots, map dashes and plum waves. Use at 5–12% visual density; leave ample quiet space.

## 8. Digital component system

### App and web

| Element | Specification |
| --- | --- |
| Primary CTA | Gold-500 fill, Ink label, 16 px radius, 44 px minimum height; hover/press darkens 8%. |
| Secondary CTA | Cream fill, 2 px Ink outline, Plum label. |
| Navigation | Cream or Plum field; active item has Gold underline or sticker pin—never colour alone. |
| Destination card | Cream card; thumbnail scenic-window crop; destination title, short warm clue, save control. |
| AI chat | Panda avatar for assistant; Cream assistant bubble and Butter user bubble; clear “AI travel guide” label. |
| Map pins | Gold route pin for active stop, Plum for saved stop, Cream centre dot; shapes must remain distinguishable without colour. |
| Loading/empty state | One low-motion panda pose plus one brief helpful sentence. |

Accessibility baseline: WCAG AA contrast for normal text, labelled icon controls, 44 × 44 px touch targets, non-colour state indicators, and reduced-motion fallback.

### Required reusable items

- SVG icon set and map-pin set.
- 8 panda PNG/SVG-style pose exports with transparent backgrounds.
- Design tokens for colour, typography, radius, outline, shadow and spacing.
- Figma-ready component specifications / implementation-neutral asset naming.

## 9. Social system

- Profile: panda head-and-phone sticker on Plum-900 round field.
- Feed posts: 1:1 and 4:5 templates with a scenic window, Gold route, large destination name, and panda guide corner.
- Story/reel: 9:16 templates with safe areas for platform UI, trip tip title, short prompt, and sticker pack.
- Short-video cover: 9:16 destination frame with 3–5 word hook; avoid text over the panda’s eyes or phone screen.
- End card: Cream field, logo/avatar, `go2china.space`, and one Gold CTA chip.
- Campaign examples: “First 48 Hours in Beijing”, “China Train Cheat Sheet”, “A Local’s Chengdu Food List”.

## 10. Deliverables and acceptance criteria

| Deliverable | Acceptance criteria |
| --- | --- |
| English VI guide | Covers all sections 3–9, includes correct/incorrect examples and export guidance. |
| Logo package | Uses original logo master; each derivative is named and sized for web/social use. |
| IP pose pack | Eight clearly differentiated, on-brand uses without altering facial identity. |
| Icon/graphic pack | Consistent 2 px rounded-outline language; legible at 24 px. |
| Web/app kit | Token sheet and component visuals cover CTA, nav, card, chat, pins, loading and empty states. |
| Social kit | Editable layout templates cover avatar, 1:1, 4:5 and 9:16, plus end card. |
| Quality bar | English copy proofread; all production colours documented; all images have appropriate alt-text/copy guidance; transparent assets have clean edges. |

## 11. Assumptions and decisions pending production

- English is the primary audience language. Any Chinese characters appear only as accurate travel context and must be proofread before release.
- Brand tagline is provisional until the owner selects a final trademark/marketing line.
- The supplied assets are authorised for VisePanda use; only their visual derivative system is in scope.
- The initial handoff is a digital-first package. Print production profiles, trademark registration, and commercial font licensing are excluded.

## 12. Rollback

All new material will live under a dedicated `brand/` delivery directory. Removing that directory restores the repository to its current supplied-brand-assets-only state; source logo assets remain untouched.

## 13. Production order

1. Verify source-logo colours and character proportions.
2. Create the master VI guide and token sheet.
3. Generate and curate the panda pose/illustration assets.
4. Assemble web/app UI kit and social template set.
5. Render the guide and test key assets at small sizes and against contrast rules.
