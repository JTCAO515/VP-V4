# Remaining acceptance

- Signed physical device, VoiceOver spoken traversal and Store upload: UNRUN; no signing/account action authorized by this slice.
- iOS17 runtime: UNRUN; installed simulator runtime is iOS26.5, deployment target remains17.0.
- Real AI/account/same-Trip: not implemented in this foundation; owned by downstream contracts.
- Web release-language migration and contextual Ask sheet: outstanding VPJ-01 work.
- Public icon/material rights: outstanding release decision; Simulator-only source retained.
- Merge: pending independent review/final CI and OA-VPJ-MERGE-DEPLOY. GitHub reports a successful
  Production-named deployment of main589cee6; actual Vercel auto-deployment settings remain inaccessible.
  No deployment/branch protection settings were changed.

Next-frontier read-back (2026-09-09): `pnpm db:verify` found the V4 local baseline but all
user/ops/worker connection paths were `not-configured`. Supabase project metadata exposed only
an old VP-Final project, not a verified V4 Staging target. ADR-0006 forbids treating old credentials
or data as V4 lineage. OA-VPJ-02 was made specific; no database query or migration was attempted.
