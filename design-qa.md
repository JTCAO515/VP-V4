# Design QA

## Comparison target

- Source visual truth: `design-reference/layla-desktop-1440x900.png`, `design-reference/layla-mobile-390x844.png`, and `design-reference/layla-mobile-menu-open-390x844.png`
- Implementation: `http://localhost:4173/`
- Implementation screenshots: `design-reference/implementation-desktop-1440x900-final.png`, `design-reference/implementation-mobile-390x844-final.png`, and `design-reference/implementation-mobile-menu-open-390x844-final.png`
- Combined evidence: `design-reference/comparison-desktop-hero.png`, `design-reference/comparison-mobile-hero.png`, and `design-reference/comparison-mobile-menu.png`

## Normalization

- Desktop viewport: 1440 × 900 CSS px; source 1440 × 900 px; implementation 1440 × 900 px; device scale factor 1.
- Mobile viewport: 390 × 844 CSS px; source 390 × 844 px; implementation 390 × 844 px; device scale factor 1.
- State: Chinese homepage, cookie consent dismissed, prompt empty, menus closed for hero comparisons; account drawer open for the mobile menu comparison.
- Cropping: no browser chrome and no device frame. Each pair uses the same viewport and state.

## Required fidelity surfaces

- Fonts and typography: passed. The project uses the source Fig Grotesk regular, medium, semibold, and bold WOFF2 files. Desktop and mobile hero size, wrapping, line height, weight, and tracking align with the captures.
- Spacing and layout rhythm: passed. Desktop hero coordinates, 900 px first section, 32/80 px page gutters, 500 px clover media, 144 px prompt, mobile 196 px media, prompt placement, card radii, section ordering, and responsive overflow match the source intent.
- Colors and tokens: passed. Core tokens map to source values: paper `#f7f6f3`, ink `#2a182e`, lilac `#c9a9fa`, soft lilac `#e5daf9`, and divider `#d4d1d5`.
- Image quality and asset fidelity: passed with one documented replacement. All downloadable source assets are local. Three source Firebase testimonial resources failed to download; the captured testimonial state was used with ImageGen to create `public/assets/review-video-lavender-background.png`. No hotlinks remain.
- Copy and content: passed. Captured Chinese headings, labels, travel examples, FAQ questions, partner/press names, and footer groups are represented. Dynamic source placeholders and the live planned-trip counter can change over time; the clone freezes the captured copy.
- Icons: passed. The source logo and marks are local assets; controls use Lucide, matching the source page's observed icon family. Mobile account-menu icon mismatches found in pass 2 were replaced with matching help, message, and document icons.
- Responsiveness and accessibility: passed. No horizontal overflow at 390 px; controls have semantic labels, visible focus handling, alt text, reduced-motion support, and usable mobile targets.

## Full-view and focused comparison evidence

- Full-view evidence: desktop and mobile hero pairs in `comparison-desktop-hero.png` and `comparison-mobile-hero.png` confirm composition, typography, image mask, prompt, suggestions, palette, and vertical rhythm.
- Focused evidence: `comparison-mobile-menu.png` confirms the account drawer's sheet position, dimming, menu order, dividers, typography, and icon family. The hero comparisons are also readable enough to inspect the logo, header controls, textarea, prompt tools, chips, and Bellboy CTA without a second crop.

## Comparison history

### Pass 1 — blocked

- [P1] Joy section used large image cards instead of the source's alternating horizontal image/text pills.
  - Fix: replaced the cards with two 72–84 px capsule rows and the centered display statement.
- [P1] Planner section used a full half-card photograph rather than the compact clover-masked media.
  - Fix: locked the card to the source height and applied the captured brand clip to a 280 px source image.
- [P2] Desktop hero sat 30 px below the source because navigation occupied document flow.
  - Fix: made the navigation fixed and restored the 900 px hero coordinate system.
- [P2] Investor and team cards used generic large rounded cards.
  - Fix: restored circular investor portraits, source-shaped team masks, source-like four-up desktop layout, and carousel controls.

### Pass 2 — blocked

- [P2] Mobile account navigation was constrained inside the header and appeared at the top.
  - Fix: removed the containing-block backdrop filter and restored the bottom-sheet position and dimmed scrim.
- [P2] Mobile hero title was left aligned and too wide.
  - Fix: matched the centered balanced 30 px source title and exact prompt/chip positions.
- [P2] Desktop FAQ used a centered single column instead of the source's split heading/accordion layout.
  - Fix: implemented the 34/66 desktop grid and returned to one column on mobile.

### Pass 3 — passed

- Earlier P0/P1/P2 findings were rechecked against the same desktop, mobile, and mobile-menu captures.
- Browser console: no error or warning entries during final checks.
- Primary interactions tested: prompt/send state, toast feedback, account drawer, language dialog, feature slide selection, testimonial play/pause, and FAQ expand/collapse.
- Remaining P3: the autoplaying hero video frame naturally differs between screenshots; asset, crop, clover mask, size, and playback behavior are the same.

## Findings

No actionable P0, P1, or P2 findings remain.

## Follow-up polish

- [P3] A future capture can freeze both hero videos to the same frame for a literal frame-by-frame screenshot diff.

## Implementation checklist

- [x] Desktop and mobile visual comparison
- [x] Mobile account-menu comparison
- [x] Source fonts and assets local
- [x] Primary interactions tested
- [x] Console errors checked
- [x] Build and Sites worker checks recorded in handoff

final result: passed
