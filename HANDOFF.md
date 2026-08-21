# Handoff

VP-V4 is a frontend-only VisePanda landing page built with Next.js App Router, React, strict TypeScript, and Tailwind CSS v4. It presents the Chatbot, Trip Canvas, Today, trusted execution facts, and recovery model for international independent travelers visiting China.

This change simplifies the visible product story:

- the four “plan, remember, execute, recover” cards always display complete text and no longer expose detail toggles;
- the guessing marquee and evidence-delivery sections are removed;
- FAQ renders 10 questions after removing the execution-moments and input-storage items;
- the header no longer contains metric/imperial state;
- the display button shows the locale currency symbol, and the language button shows the locale flag;
- the language modal renders `🇨🇳中文`, `🇺🇸English`, `🇪🇸Español`, `🇷🇺Русский`, and `🇸🇦العربية`;
- Arabic keeps `lang="ar"` and `dir="rtl"`.

Verification evidence:

- `pnpm lint` passed.
- `pnpm typecheck` passed.
- `pnpm build` passed with Next.js 16.2.6 and static `/` output.
- `pnpm test` passed 10/10 regression tests.
- desktop browser QA at 1440 × 1000 passed with no horizontal overflow or error overlay.
- mobile browser QA at 390 × 844 passed with no horizontal overflow; both first and fourth capability cards showed full text.
- all five locale flag/currency mappings passed; Arabic RTL passed.
- browser console contained no errors. One Next.js development-only LCP warning appeared after reloading at a scrolled position.
- project documentation scan found no prohibited historical brand or clone terminology.

The page does not call real AI, save Prompt input, expose account or Trip data, book inventory, make payments, provide Human Help, or promise complete city coverage. Bundled fonts and shape masks still need rights review before production release.

Rollback: revert the UI simplification commit.

Next action: push the verified commit to `main` and verify the matching Vercel deployment.
