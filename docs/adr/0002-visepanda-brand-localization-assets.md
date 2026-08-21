# ADR-0002: VisePanda brand, localization, and travel assets

Status: accepted by direct operator instruction on 2026-08-21.

## Context

The Next.js migration preserved a Layla-inspired visual structure but still rendered reference-brand imagery and lacked real language switching. The operator requested VisePanda wordmarks, English/Spanish/Russian/Arabic support, China-travel imagery that keeps the accepted slot formats, and removal of the full four-promises chapter.

## Decision

- Render `VisePanda.` as text in the existing local type treatment in the header and footer.
- Keep Chinese as the initial locale and maintain complete typed dictionaries for `zh`, `en`, `es`, `ru`, and `ar` in `lib/i18n.ts`.
- Update the root document `lang` and `dir` when locale changes; Arabic is RTL and the other locales are LTR.
- Replace runtime source-site media with nine ImageGen photographs stored under `public/assets/visepanda/`, retaining the existing image slots and masks.
- Replace reference investor/media logo walls with VisePanda product-trust badges.
- Remove the entire four-promises chapter.

## Consequences

- All visible copy changes must be made in five locales.
- Runtime media must not reference `/assets/source/`; bundled font files are the intentional exception needed for the accepted same-font wordmark.
- Arabic browser QA must check navigation order, alignment, overflow, modal behavior, and readable mixed-direction content.
- The generated photography is product-local, but the retained local fonts and shape masks still require a rights review before public release.

## Rollback

Revert the VisePanda brand/localization/assets commit.
