# Handoff

VP-V4 runs on Next.js App Router, React, strict TypeScript, and Tailwind CSS v4. The header and footer now use a VisePanda wordmark in the accepted type treatment. Runtime copy, aria labels, toasts, metadata, and project documents use VisePanda product-preview language.

The language menu now switches the complete landing page between Chinese, English, Spanish, Russian, and Arabic. Arabic also updates the document to `lang="ar"` and `dir="rtl"`. Nine project-local China-travel images replace runtime reference photography while retaining the existing clover, circle, portrait, and landscape slots. Reference logo walls were replaced with semantic product badges, and the full four-promises chapter was removed.

The page remains a frontend-only draft. It does not call real AI, save Prompt input, expose account or Trip data, book inventory, make payments, provide Human Help, or promise complete city coverage.

No Layla image, video, portrait, or logo path is used at runtime. The requested same-font treatment retains the existing bundled local fonts, and existing shape masks remain, so those two asset classes still need a rights review before public release.

Verification evidence and residual risks are recorded in [design-qa.md](design-qa.md). Roll back by reverting the framework-and-copy migration commit.

`pnpm check` passes: source policy lint, strict TypeScript, Next.js production build, and 7/7 static regression tests. Browser-rendered QA remains blocked because this managed sandbox rejects local port binding with `EPERM`; do not treat the browser gate as green.

Next action: review the branch preview at desktop and 390×844, switch through all five languages, and verify Arabic RTL before production promotion.
