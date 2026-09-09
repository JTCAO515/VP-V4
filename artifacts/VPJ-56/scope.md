# VPJ-56 unsigned CI preparation

Related to #237; Class A, repository preparation only. Inputs frozen at main
2c46519 (PR258 native foundation merged). VPJ-01 #188 remains open for device/product
acceptance; its signed release prerequisites do not block this isolated CI slice.

Implement one independent pull_request/workflow_dispatch macOS job that builds the
existing shared VisePanda scheme and runs all 8 unit + 5 UI tests without signing.
Preserve Quality PR and native business source. Add runner orchestration under
scripts/ios and this scoped contract/evidence under docs/contracts and artifacts/VPJ-56.
These adjacent contract paths document the split, as allowed by the current workflow.

Apple identity, certificates, signing Archive, TestFlight upload/install, Store SDK
submission policy and certificate rotation remain operator work. No production secrets,
Store uploads, production migration, account mutation or product acceptance in this slice.
