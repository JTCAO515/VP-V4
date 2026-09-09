# Remaining acceptance

- Signed physical device, VoiceOver spoken traversal and Store upload: UNRUN; no signing/account action authorized by this slice.
- iOS17.5 runtime: executed 2026-09-10; 8 unit PASS, UI 3 PASS / 4 FAIL (Text clipped). Minimum-runtime accessibility acceptance remains FAIL; see native-acceptance/verification.md.
- Real AI/account/same-Trip: not implemented in this foundation; owned by downstream contracts.
- Web release-language migration merged in PR259. Contextual Ask sheet remains outstanding VPJ-01 work.
- Public icon/material rights: outstanding release decision; Simulator-only source retained.
- Merge gate resolved on 2026-09-09: JT explicitly authorized VP-V4 production publishing.
  PR258/259 merged after applicable CI and independent review. No deployment/branch-protection
  settings were changed; database and full native/Store acceptance remain separate.

Next-frontier read-back (2026-09-09): `pnpm db:verify` found the V4 local baseline but all
user/ops/worker connection paths were `not-configured`. Supabase project metadata exposed only
an old VP-Final project, not a verified V4 Staging target. ADR-0006 forbids treating old credentials
or data as V4 lineage. OA-VPJ-02 was made specific; no database query or migration was attempted.

- 新增最大字号完整contrast调查已运行且FAIL，详见native-acceptance/viewport-probe.md；不要归入UNRUN。iOS17.5安装本身也不是运行验收。
