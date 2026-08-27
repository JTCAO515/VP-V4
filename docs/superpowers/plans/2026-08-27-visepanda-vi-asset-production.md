# VisePanda VI Asset Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce an English, digital-first VisePanda visual identity handbook and a ready-to-use social, web, and mobile-app asset kit based on the owner-supplied panda logo.

**Architecture:** Preserve `assets/brand/vise-panda/` as immutable source artwork. Add a new `brand/` delivery tree with one token source, one HTML handbook that consumes it, transparent panda illustrations, SVG UI graphics, and platform-sized social compositions. The handbook remains the usage authority; its colour and component tokens are the source for all reusable assets.

**Tech Stack:** Hand-authored SVG and HTML/CSS, owner-supplied PNG/SVG artwork, built-in image generation for original raster panda poses, PowerShell validation, and a browser/PDF render only if needed for final review.

## Global Constraints

- Primary audience language is English; Chinese appears only when it is accurate, context-specific travel content.
- Do not modify, redraw, crop destructively, or recolour `assets/brand/vise-panda/` source assets.
- Use the palette roles defined in `docs/superpowers/specs/2026-08-27-visepanda-vi-design.md`, then document final sampled values in `brand/tokens/visepanda.tokens.json`.
- Use a cream sticker edge, rounded ink keylines, hand-drawn restraint, and vintage plum/gold contrast; do not introduce neon, glossy 3D, cyberpunk, or generic SaaS styling.
- Production text must meet WCAG AA contrast; all touchable UI examples must be at least 44 × 44 px.
- Generated transparent assets must retain clean alpha edges. All new deliverables live under `brand/` and can be removed as one rollback unit.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `brand/README.md` | Inventory, usage, source provenance, and export instructions. |
| `brand/tokens/visepanda.tokens.json` | Machine-readable colour, type, space, radius, outline and shadow tokens. |
| `brand/guidelines/visepanda-vi-guide.html` | English brand handbook containing rules, examples and linked assets. |
| `brand/guidelines/visepanda-vi-guide.css` | All handbook layout and visual presentation styles. |
| `brand/ip/` | Eight transparent panda-guide pose PNG exports and a pose index. |
| `brand/icons/visepanda-utilities.svg` | The 12 utility icons as one SVG sprite. |
| `brand/icons/visepanda-map-pins.svg` | Active, saved and utility map-pin SVG symbols. |
| `brand/social/` | Avatar, 1:1 feed, 4:5 feed, 9:16 Story/reel cover, and 9:16 end-card assets. |
| `brand/ui/visepanda-ui-kit.svg` | Visual reference sheet for CTA, navigation, card, chat, pins, loading, and empty state. |
| `brand/qa/asset-manifest.json` | Exact expected files, pixel dimensions, formats, alt text and source attribution. |

## Task 1: Establish the immutable source reference and design-token source

**Files:**
- Create: `brand/README.md`
- Create: `brand/tokens/visepanda.tokens.json`
- Create: `brand/qa/asset-manifest.json`
- Read only: `assets/brand/vise-panda/README.md`, `VP-Logo.svg`, `VP-Logo.png`, `VP-正面全身.png`, `VP-三视图.png`

**Interfaces:**
- Consumes: the four owner-supplied source asset filenames and the approved VI specification.
- Produces: `tokens.color`, `tokens.typography`, `tokens.layout`, `tokens.material`, and `manifest.assets[]`; all later tasks reference these names rather than inventing values.

- [ ] **Step 1: Create the delivery folders**

Run:

```powershell
New-Item -ItemType Directory -Force brand/tokens,brand/guidelines,brand/ip,brand/icons,brand/social,brand/ui,brand/qa | Out-Null
```

Expected: seven directories exist; no file below `assets/brand/vise-panda/` changes.

- [ ] **Step 2: Add the canonical token JSON**

Create `brand/tokens/visepanda.tokens.json` with `VP-Plum-900`, `VP-Plum-700`, `VP-Gold-800`, `VP-Gold-500`, `VP-Butter-100`, `VP-Cream-50`, and `VP-Ink-950`; type families `Baloo 2`, `Nunito Sans`, and `Noto Sans`; 8 px spacing; standard 16 px and feature 24 px radii; a 2 px ink outline; and one plum 12–16% offset shadow. Include descriptions and CSS-ready `value` values for every token.

Expected: JSON parses and contains exactly the token names used by the handbook and SVG assets.

- [ ] **Step 3: Add the inventory and manifest skeleton**

Create `brand/README.md` documenting the upstream source paths, explicit rule that sources are immutable, and an asset inventory table. Create `brand/qa/asset-manifest.json` with an initially empty `assets` list, then populate it as subsequent tasks finish.

Expected: a new contributor can identify every source and destination without opening image binaries.

- [ ] **Step 4: Validate the token and manifest JSON**

Run:

```powershell
Get-Content -Raw brand/tokens/visepanda.tokens.json | ConvertFrom-Json | Out-Null
Get-Content -Raw brand/qa/asset-manifest.json | ConvertFrom-Json | Out-Null
git diff --check
```

Expected: commands return exit code 0 with no whitespace errors.

- [ ] **Step 5: Commit the foundation**

```powershell
git add brand/README.md brand/tokens/visepanda.tokens.json brand/qa/asset-manifest.json
git commit -m "feat: add VisePanda identity foundation tokens"
```

## Task 2: Produce the panda-guide pose library

**Files:**
- Create: `brand/ip/welcome.png`
- Create: `brand/ip/guide.png`
- Create: `brand/ip/recommend.png`
- Create: `brand/ip/transit.png`
- Create: `brand/ip/translate.png`
- Create: `brand/ip/celebrate.png`
- Create: `brand/ip/gentle-alert.png`
- Create: `brand/ip/rest.png`
- Create: `brand/ip/README.md`
- Modify: `brand/qa/asset-manifest.json`

**Interfaces:**
- Consumes: supplied panda source image(s), token colours, and the eight named states from the design specification.
- Produces: 1:1 transparent PNGs with names that match `manifest.assets[].id` and can be placed in social/UI layouts by later tasks.

- [ ] **Step 1: Inspect the supplied reference before editing/generation**

Open `assets/brand/vise-panda/VP-正面全身.png` and `VP-三视图.png` at original detail. Record the non-negotiable character traits in `brand/ip/README.md`: round white face, dark ink-brown limbs and patches, glossy open eyes, open smile, smartphone prop, cream sticker outline, and plum/gold/cream/ink palette.

Expected: the pose brief rejects changes to the panda’s face, proportions, palette, or sticker edge.

- [ ] **Step 2: Generate the first four transparent poses**

Use image generation with the supplied full-body image as the sole visual reference. Generate `welcome`, `guide`, `recommend`, and `transit` separately. Each prompt must specify: Korean minimalist flat hand-drawn cartoon, cream sticker outline, original VisePanda panda identity unchanged, dark plum and antique-gold accents, no words, no watermark, transparent background, full-body 1:1 framing, and the named action.

Expected: four square transparent images with isolated panda figures and no accidental text or background.

- [ ] **Step 3: Generate the remaining four transparent poses**

Use the same reference and invariant language for `translate`, `celebrate`, `gentle-alert`, and `rest`. `gentle-alert` must use an empathetic expression and amber notice cue, never red alarm styling. `rest` must feel calm and suitable for low-motion loading states.

Expected: all eight state names have an original image; each state is distinguishable at 96 px.

- [ ] **Step 4: Curate, document and register the selected outputs**

Keep only the selected best image per state in `brand/ip/`. Add a table in `brand/ip/README.md` with state, intended placement, alt text and forbidden use. Add each output to `manifest.assets` with format `png`, transparent background and expected `1024 × 1024` dimension.

Expected: every image has a clear product purpose and accessible alt description.

- [ ] **Step 5: Verify images and commit the IP pack**

Run:

```powershell
Get-ChildItem brand/ip -Filter *.png | Measure-Object | Select-Object -ExpandProperty Count
Get-Content -Raw brand/qa/asset-manifest.json | ConvertFrom-Json | Out-Null
```

Expected: exactly 8 PNG pose assets; manifest JSON parses.

```powershell
git add brand/ip brand/qa/asset-manifest.json
git commit -m "feat: add VisePanda guide pose library"
```

## Task 3: Build the reusable icon, map-pin, and pattern assets

**Files:**
- Create: `brand/icons/visepanda-utilities.svg`
- Create: `brand/icons/visepanda-map-pins.svg`
- Create: `brand/icons/visepanda-pattern.svg`
- Create: `brand/icons/README.md`
- Modify: `brand/qa/asset-manifest.json`

**Interfaces:**
- Consumes: colours in `visepanda.tokens.json` and `VP-Ink-950` as the consistent 2 px rounded stroke.
- Produces: SVG `<symbol>` identifiers: `itinerary`, `map`, `save`, `transport`, `translation`, `food`, `stay`, `currency`, `weather`, `safety`, `chat`, `share`, `pin-active`, `pin-saved`, and `pin-utility`.

- [ ] **Step 1: Write the utility SVG sprite**

Create `visepanda-utilities.svg` with the 12 documented `<symbol>` IDs, each using `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, and `stroke-linejoin="round"`. Use solid, simple geometry; do not use emoji, third-party icon paths, or gradients.

Expected: every specified symbol renders with the same visual weight at 24 px.

- [ ] **Step 2: Write the map-pin SVG sprite**

Create `visepanda-map-pins.svg` with three named symbols. `pin-active` uses Gold fill and Ink outline, `pin-saved` uses Plum fill and Cream centre, and `pin-utility` uses Cream fill and Ink outline. Give each an internal shape/mark so meaning remains distinguishable without colour alone.

Expected: pin variants differ by form as well as colour.

- [ ] **Step 3: Write the decorative pattern SVG**

Create `visepanda-pattern.svg` with a reusable `pattern` element containing tiny clouds, leaf/bamboo marks, ticket dashes, a map-route curve and plum waves. Use low density, no text, and token colours with opacity between 0.05 and 0.12.

Expected: the pattern decorates a section without competing with body copy.

- [ ] **Step 4: Document and register all SVGs**

Create `brand/icons/README.md` listing every symbol ID and its semantic use. Add the three files to `manifest.assets` with their type and a concise accessible description.

- [ ] **Step 5: Validate SVG and commit**

Run:

```powershell
rg -n '<symbol id="(itinerary|map|save|transport|translation|food|stay|currency|weather|safety|chat|share|pin-active|pin-saved|pin-utility)"' brand/icons
rg -n 'stroke-width="2"|stroke-linecap="round"|stroke-linejoin="round"' brand/icons/visepanda-utilities.svg
git diff --check
```

Expected: all 15 IDs are found; utility-stroke rule is found; no whitespace errors.

```powershell
git add brand/icons brand/qa/asset-manifest.json
git commit -m "feat: add VisePanda utility icon system"
```

## Task 4: Assemble social templates and platform exports

**Files:**
- Create: `brand/social/avatar-1080.png`
- Create: `brand/social/beijing-48-hours-1080.png`
- Create: `brand/social/china-train-cheat-sheet-1080x1350.png`
- Create: `brand/social/chengdu-food-list-1080x1920.png`
- Create: `brand/social/reel-end-card-1080x1920.png`
- Create: `brand/social/README.md`
- Modify: `brand/qa/asset-manifest.json`

**Interfaces:**
- Consumes: original supplied logo, selected `brand/ip/` poses, token values, scenic-window composition rule, and social safe-area guidance.
- Produces: ready-to-post PNG files in exact names/dimensions, all with English display copy.

- [ ] **Step 1: Create the profile avatar**

Make a `1080 × 1080` PNG using a close crop of the supplied panda head-and-phone on Plum-900, retaining the Cream sticker outline. Do not use small ribbons or URLs in this avatar.

Expected: the panda remains identifiable at 64 px.

- [ ] **Step 2: Create square and portrait feed examples**

Make a `1080 × 1080` “First 48 Hours in Beijing” post and a `1080 × 1350` “China Train Cheat Sheet” post. Both must include a Cream content field, Gold route, contextual scenery, rounded Display copy, one panda pose, and a small logo/URL treatment with sufficient clear space.

Expected: titles stay legible on a phone; no essential content relies only on gold colour.

- [ ] **Step 3: Create Story/reel cover and end-card**

Make `1080 × 1920` “A Local’s Chengdu Food List” and `1080 × 1920` end-card PNGs. Keep the title within the central 1080 × 1420 safe area; the end card presents the avatar, `go2china.space`, and one Gold CTA chip.

Expected: platform overlay areas do not hide critical text, panda eyes, CTA, or URL.

- [ ] **Step 4: Document templates and register outputs**

Write `brand/social/README.md` with platform use, dimensions, safe-area note, copy limits, and alt text for each export. Add five social assets to `manifest.assets`.

- [ ] **Step 5: Verify dimensions and commit**

Run:

```powershell
Add-Type -AssemblyName System.Drawing
Get-ChildItem brand/social -Filter *.png | ForEach-Object { $image=[System.Drawing.Image]::FromFile($_.FullName); "$($_.Name): $($image.Width)x$($image.Height)"; $image.Dispose() }
```

Expected: `1080x1080`, `1080x1080`, `1080x1350`, `1080x1920`, and `1080x1920` in filename order.

```powershell
git add brand/social brand/qa/asset-manifest.json
git commit -m "feat: add VisePanda social media kit"
```

## Task 5: Produce the web and mobile UI reference kit

**Files:**
- Create: `brand/ui/visepanda-ui-kit.svg`
- Create: `brand/ui/README.md`
- Modify: `brand/qa/asset-manifest.json`

**Interfaces:**
- Consumes: tokens, icon sprites, map-pin forms, IP pose `rest.png`, and the design specification’s component table.
- Produces: a labelled visual sheet with components named `primary-cta`, `secondary-cta`, `navigation`, `destination-card`, `ai-chat`, `map-pins`, `loading`, and `empty-state`.

- [ ] **Step 1: Draw accessible controls and navigation**

Create a 1600 × 1100 SVG visual sheet. Include a Gold primary CTA with Ink text, Cream secondary CTA with Ink outline, and a Cream/Plum navigation pair. Label each style in English; display focus treatment and 44 px minimum touch height explicitly.

Expected: every text/control pair has adequate contrast and the active nav state has a non-colour marker.

- [ ] **Step 2: Draw card, AI chat, and map-pin states**

Add one destination card with a scenic window, 1–2 line warm local clue, Save control, and appropriate pin examples. Add an assistant chat bubble labelled “AI travel guide” and a user bubble differentiated by both label/shape and colour.

Expected: the sheet demonstrates product hierarchy without pretending AI output is guaranteed travel advice.

- [ ] **Step 3: Draw loading and empty states**

Use `rest.png` only as an external linked/placed reference if SVG supports it; otherwise use a framed placeholder with the exact intended asset filename and include the use in README. Add helpful English copy: “Finding a little local magic…” and “Nothing saved yet—let’s find your next stop.”

Expected: both states have low-motion visual intent and concise, friendly copy.

- [ ] **Step 4: Document and validate**

Create `brand/ui/README.md` mapping each component title to use, colours, minimum touch target and text alternative. Register the kit SVG in the manifest.

Run:

```powershell
rg -n 'primary-cta|secondary-cta|navigation|destination-card|ai-chat|map-pins|loading|empty-state' brand/ui/visepanda-ui-kit.svg
Get-Content -Raw brand/qa/asset-manifest.json | ConvertFrom-Json | Out-Null
```

Expected: every component name is found and the asset manifest parses.

- [ ] **Step 5: Commit the UI kit**

```powershell
git add brand/ui brand/qa/asset-manifest.json
git commit -m "feat: add VisePanda digital UI kit"
```

## Task 6: Build and verify the English visual-identity handbook

**Files:**
- Create: `brand/guidelines/visepanda-vi-guide.html`
- Create: `brand/guidelines/visepanda-vi-guide.css`
- Modify: `brand/README.md`
- Modify: `brand/qa/asset-manifest.json`

**Interfaces:**
- Consumes: all preceding asset paths and token names.
- Produces: a self-contained English handbook with HTML sections `purpose`, `logo`, `colour`, `type`, `ip`, `illustration`, `digital`, `social`, `accessibility`, and `exports`.

- [ ] **Step 1: Create the handbook structure and content**

Build semantic HTML sections using the exact section IDs above. Cover brand promise, logo lockups/clear space/minimum size/approved grounds/misuse, final palette swatches, typography, IP state table, icon/pattern language, UI kit, social templates, and handoff directions. Link or embed only paths contained in `brand/` or immutable source assets.

Expected: a reader understands when and how to use every asset without relying on chat context.

- [ ] **Step 2: Apply the hand-drawn sticker visual presentation**

Create CSS that uses token values, a soft Cream canvas, Plum feature panels, Gold route accents, Baloo 2/Nunito Sans fallbacks, rounded component samples, and one restrained offset shadow. Use responsive rules for 375 px, 768 px, 1024 px and 1440 px wide viewports.

Expected: the guide itself demonstrates the system while preserving body-text legibility.

- [ ] **Step 3: Add correct/incorrect usage examples**

Add one visual/text pair each for permitted logo use versus stretching/recolouring/crowding; palette use versus low contrast; Panda guide use versus unsafe/authority/cultural-costume misuse; and gold accent versus gold-only critical meaning.

Expected: every rejection is explicit and actionable.

- [ ] **Step 4: Render and review the guide at target sizes**

Open the handbook locally at 375 px, 768 px, 1024 px and 1440 px. Capture one reference screenshot per size under `brand/qa/` only if needed to document review. Fix clipping, horizontal scroll, contrast failures, missing image alt text, or broken local links before continuing.

Expected: all sections render; no horizontal scrolling at 375 px; every meaningful image has alt text.

- [ ] **Step 5: Register and commit the handbook**

Add the guide and CSS to `manifest.assets`, update `brand/README.md` with the handbook opening instructions, then run:

```powershell
rg -n 'id="(purpose|logo|colour|type|ip|illustration|digital|social|accessibility|exports)"' brand/guidelines/visepanda-vi-guide.html
git diff --check
git add brand/guidelines brand/README.md brand/qa/asset-manifest.json
git commit -m "docs: add VisePanda visual identity handbook"
```

Expected: all ten handbook section IDs are found; git reports no whitespace errors; commit succeeds.

## Task 7: Perform release QA and package the VI system

**Files:**
- Create: `brand/qa/verification.md`
- Modify: `brand/qa/asset-manifest.json`
- Modify: `brand/README.md`

**Interfaces:**
- Consumes: every `brand/` output created in Tasks 1–6.
- Produces: a dated, evidence-based release record with pass/fail checks, paths, residual risks and rollback instruction.

- [ ] **Step 1: Verify required asset inventory**

Write `brand/qa/verification.md` with a table listing every required file from the File structure section and a PASS/FAIL record. Use this exact check:

```powershell
$required = @(
  'brand/tokens/visepanda.tokens.json','brand/guidelines/visepanda-vi-guide.html','brand/guidelines/visepanda-vi-guide.css',
  'brand/icons/visepanda-utilities.svg','brand/icons/visepanda-map-pins.svg','brand/icons/visepanda-pattern.svg',
  'brand/ui/visepanda-ui-kit.svg','brand/social/avatar-1080.png','brand/social/beijing-48-hours-1080.png',
  'brand/social/china-train-cheat-sheet-1080x1350.png','brand/social/chengdu-food-list-1080x1920.png',
  'brand/social/reel-end-card-1080x1920.png'
)
$required + (Get-ChildItem brand/ip -Filter *.png | Select-Object -ExpandProperty FullName) | ForEach-Object { "$($_): $(Test-Path $_)" }
```

Expected: all listed paths report `True` and `brand/ip` contains exactly eight pose images.

- [ ] **Step 2: Validate formats, source immutability, and metadata**

Run:

```powershell
Get-Content -Raw brand/tokens/visepanda.tokens.json | ConvertFrom-Json | Out-Null
Get-Content -Raw brand/qa/asset-manifest.json | ConvertFrom-Json | Out-Null
git diff --name-only 5900cd5..HEAD -- assets/brand/vise-panda
git diff --check
```

Expected: both JSON files parse; source-asset diff is empty; no whitespace errors.

- [ ] **Step 3: Complete release notes and commit**

Record actual commands run, visual review viewport results, unrun checks, residual risks, rollback (`remove brand/` only), mandatory reading order (handbook → README → manifest), and exactly one next action: “Owner approves final asset selection for external publication.”

```powershell
git add brand/qa brand/README.md
git commit -m "docs: verify VisePanda VI delivery"
```

Expected: the final commit leaves no changes except pre-existing unrelated work.

## Plan self-review

- **Spec coverage:** Task 1 covers foundations and source safety; Task 2 the IP states; Task 3 illustrations/icons/patterns; Task 4 social outputs; Task 5 app/web components and accessibility; Task 6 the English guide and usage examples; Task 7 inventory, source integrity, rollback and handoff.
- **No placeholders:** The plan contains no deferred or incomplete instructions. Variables such as exact sampled colour values are explicitly resolved in Task 1 before any dependent output.
- **Interface consistency:** Asset IDs and filenames defined in the File structure and Task 2 match Tasks 4–7. Handbook section IDs are defined once in Task 6 and verified in the same task.
