# Handoff

VP-V4 has been migrated from Vite/JavaScript to Next.js App Router, React, strict TypeScript, and Tailwind CSS v4. Runtime copy, aria labels, toasts, metadata, and project documents now use the approved VisePanda product-preview language.

The page remains a frontend-only draft. It does not call real AI, save Prompt input, expose account or Trip data, book inventory, make payments, provide Human Help, or promise complete city coverage.

The reference-site images, video, logo, portraits, and fonts remain intentionally untouched in this migration and block public release.

Verification evidence and residual risks are recorded in [design-qa.md](design-qa.md). Roll back by reverting the framework-and-copy migration commit.

Automated checks and the production build pass. Browser-rendered QA remains blocked because this managed sandbox rejects local port binding with `EPERM`; do not treat the browser gate as green.

Next action: separate asset, brand, and real-interface migration review.
