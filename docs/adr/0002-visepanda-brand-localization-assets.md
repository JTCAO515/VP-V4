# ADR-0002: VisePanda brand, localization, and travel assets

Status: accepted by direct operator instruction on 2026-08-21.

## Context

The Next.js landing page needed complete VisePanda wordmarks, real language switching, and China-travel imagery aligned with the product's international independent-traveler positioning. The operator requested English, Spanish, Russian, and Arabic support in addition to Chinese while keeping the accepted image-slot formats.

## Decision

- Render `VisePanda.` as text in the existing local type treatment in the header and footer.
- Keep Chinese as the initial locale and maintain complete typed dictionaries for `zh`, `en`, `es`, `ru`, and `ar` in `lib/i18n.ts`.
- Update the root document `lang` and `dir` when locale changes; Arabic is RTL and the other locales are LTR.
- Use nine ImageGen photographs stored under `public/assets/visepanda/`, retaining the existing image slots and masks.
- Use VisePanda product-trust badges instead of third-party investor or media logo walls.
- Remove the entire four-promises chapter.

## Consequences

- All visible copy changes must be made in five locales.
- Runtime media must use project-local VisePanda asset paths; bundled font files remain the intentional exception needed for the accepted wordmark treatment.
- Arabic browser QA must check navigation order, alignment, overflow, modal behavior, and readable mixed-direction content.
- The generated photography is product-local, but the retained local fonts and shape masks still require a rights review before public release.

## Rollback

Revert the VisePanda brand/localization/assets commit.

## Brand rendering amendment — 2026-09-10

The operator supplied two new PNGs, identified them as Logo and text Logo, and explicitly requested replacement of the previous logo. The original text-only wordmark decision above is superseded for brand display by these supplied images. Web uses the shared image wordmark and logo favicon; native uses the supplied logo, wordmark and a 1024px AppIcon derivative. Existing locale, accessibility-label and product-claim boundaries remain in force. Originals, hashes and display adaptation are recorded in `assets/brand/vise-panda/README.md` and the asset ledgers. This approval covers only the supplied replacement assets.
