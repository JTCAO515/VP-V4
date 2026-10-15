# Controlled local TestFlight sample packaging

This dedicated driver builds `space.go2china.VisePanda`, version `0.1.0`, minimum iOS `17.0`,
with `VP_CONTROLLED_SAMPLE`. All three Native backend settings and the AMap display key are
empty. The UI remains the labeled local sample even with legacy/real-service launch arguments.
Ordinary Release/Debug defaults remain unchanged.

Run from a clean committed worktree after the repository's pinned SDK installer has completed:

```sh
node scripts/maps/install-ios-sdk.mjs
python3 tests/contract/ios-controlled-testflight/test_archive.py
python3 scripts/ios/controlled-testflight/archive.py \
  --expected-head "$(git rev-parse HEAD)" \
  --evidence artifacts/IOS-TESTFLIGHT/controlled-20261015/evidence-UNIQUE_NONCE \
  --products artifacts/IOS-TESTFLIGHT/controlled-20261015/products-UNIQUE_NONCE
```

Use fresh, distinct output directories on every run. `--check-only` runs the same clean-source,
effective-build-setting, pinned-SDK and actual rollout compilation checks without an Archive.
The default build number is UTC `YYYYMMDD.HHMMSS`; select a unique number for the intended
App Store Connect build. This driver neither reads remote build numbers nor reserves them.
The source must stay clean and unchanged until the run finishes. Ignored artifacts are local.

The evidence directory contains only `manifest.json`; products, DerivedData, compiled host
checks, raw build logs and xcresult stay in the separate products tree. The manifest records
exact source head and input hashes, profile hash, Xcode, effective target settings, SDK zip
pins and extracted-file verification, compiled rollout results, merged app metadata, privacy
manifest and purpose strings, extension preservation and unsigned executable hashes.

No signing, provisioning update, profile creation, export, upload or account operation exists
in this driver. The unsigned Archive is **not installable or uploadable**. Main owns subsequent
signing/export/upload and external review. Simulator UI, physical device, ASR, provider,
GoTrue and database acceptance remain UNRUN here. A successful Archive proves device Release
compilation and these bounded static checks only; it does not demonstrate runtime behavior.

The existing `scripts/ios/archive.py` is imported only for its pure version/project/Info.plist
and privacy checks. Its CLI and staging/signing pipeline are never invoked.
