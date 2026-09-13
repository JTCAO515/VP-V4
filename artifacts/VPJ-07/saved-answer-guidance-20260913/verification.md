# Saved-answer scope and available next steps

Related to #195/#206. Native/Web five-outcome readback in PR350 exposed Web wording with no available next step for blocked questions and only a generic partial notice. This slice changes four existing en/zh display strings in `lib/grounded/copy.ts`. It names supported booking-ID/ticket-proof points, preserves other parts as unanswered, and directs the reader to current railway/station guidance. It does not identify which specific extra need the classifier omitted, expand reviewed knowledge coverage, or complete #206/S2.

Runtime source: `7974fc772815ec71a9a3b0ef3fd765d3fd8c40b6`; dedicated READY Preview `dpl_41pLhQPptZa1hZpkCRzbaybdkMsz`, Staging schema42. The real same-owner saved English passport-loss and Chinese child-document partial questions retained their original question, eligible facts, conditions, exclusions and source disclosures, with the new scope/next-step notice. Unsupported passport questions showed the new available-next-step text. No facts or stored results were rewritten.

PASS: existing grounded read-model/identity/eligibility/terminal contract tests5/5; repository `pnpm lint`; Preview build; actual browser en/zh at1280×900 and390×844; no captured warning/error console entries. Mobile English/Chinese partial and desktop Chinese blocked screenshots were visually inspected. Existing unchanged read/permission/expiry and other outcome evidence is reused from PR344/PR350 under its original scope. No new tests that merely mirror the wording.

Both normal browser sessions logged out, owned tab closed and viewport reset. Reader/Ops disabled, zero active Ops members, only owned host removed, WAF44→45→46. Before/after counters stay74 controlled Turns/74 attempts/342228 CNY micros/0 unresolved; users6/Trips3/migrations42 unchanged. No Send, worker, real model request or Trip write. CI/merge and Production guard observations follow the final PR head.

Retained setup/check corrections: `eslint` is not a repository executable; the actual source-policy `pnpm lint` passed. After resizing the Chinese browser, the first desktop screenshot was at the retained scroll offset rather than the target card; the target heading was repositioned and its final screenshot inspected. This is not evidence of the original offscreen card. Full private evidence: `/Users/jtcao/Library/Caches/visepanda/saved-answer-guidance-20260913`.

Rollback: revert the four display strings. No schema, API, producer, permission or native change.
