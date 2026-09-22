# VPJ-60 remaining acceptance

- OCR/vision, ASR and TTS have no passing real-provider result.
- The two C0 inline-image DeepSeek requests returned HTTP400 before valid usage;
  invoice cost and provider-side handling remain unknown.
- No provider file was uploaded, so provider deletion cannot be claimed.
- No user media, C1–C3 data, client key, production route, region, quality,
  cancellation, or lifecycle acceptance was exercised.

## 2026-09-22 Qwen slice

Local implementation and focused checks are recorded in [the scoped report](vision-c0-20260922.md).
Qwen real OCR quality, usage and cancellation are UNRUN pending the new media-spending
authorization. The CNY20/three-request plan is ready; old text/DeepSeek allowances are not reused.
ASR/TTS and user screenshot policy/field integration remain outside this first slice,
and no new capability is enabled. Supplier internal region, deletion and billing remain unknown.
