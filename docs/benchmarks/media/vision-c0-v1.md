# VPJ-60 synthetic vision qualification slice v1

Related to [#200](https://github.com/JTCAO515/VP-V4/issues/200), S4. This slice implements
an operator-only OCR/vision path; it does not qualify ASR, TTS, user screenshots or Trip import.
Current acceptance evidence is [VPJ-60 verification](../../../artifacts/VPJ-60/vision-c0-20260922.md).

## Existing implementation and selected path

- `lib/server/media/private-media.ts` still refuses unverified upload/deletion metadata.
  There is no authenticated user-media policy exit to reuse. Do not relabel arbitrary user
  images as C0 or wire this runner into a route, worker or client.
- `lib/server/media-translation/fixture-translation.ts` and `realtime/protocol.ts` are
  fixture/protocol evidence, not live ASR/TTS qualification.
- `invokeSyntheticVision` uses the existing pinned Qwen model, `ProtocolTransport`,
  `ProtocolUsage` and `CostGuard`; the real runner uses `createProviderHttpTransport`
  and `runWithDurableBudget`. No shared protocol, profile or worker is changed.
- One local PNG per request, 128 KiB maximum, dimensions 32–2048 with <=1,048,576 pixels.
  Signature/IHDR checks are admission checks, not a complete image decoder. The operator
  must use the supplied renderer's synthetic cards; malformed image content may still be
  rejected by the provider. No remote input URL, PDF, audio, upload/file API or fallback.
- Fixed extraction prompt, disabled thinking, 1024 output tokens, bounded response body,
  strict JSON transcript, exact pinned response model, complete valid usage required.
  Partial, tool, safety and malformed answers never become a candidate. Valid metering
  survives semantic/schema failure. A candidate is untrusted text, never a confirmed Trip.
- Client cancellation/deadline discards late output and aborts transport/body reads.
  This cannot establish that the upstream stopped generating, deleted data or charged zero.

## Frozen evaluation and provenance

`evals/media/vision-cases.ts` contains two self-authored English/Chinese cards and
`scoreVisionTranscript`. No customer data or third-party image source is used. The renderer
uses an installed CJK font and Pillow, reports the font and produces 960×560 PNGs locally.
Both cards cover names, dates, times, amounts, gate identifiers and two explicit negations.

Before calls, v1 freezes: all seven critical fields must match, and the complete transcript
must match after whitespace removal only. No fuzzy matching, alternate names, date/number
normalization, post-result thresholds or silent dropped lines. A FAIL remains a FAIL.
This is a small transcription probe, not a representative real screenshot corpus. It does
not establish bounding-box grounding, blur/rotation handling, subtitle timing or spoken quality.

## Reproduction and spending boundary

```sh
python3 evals/media/render-vision-fixtures.py /tmp/vpj60-vision-fixtures
node --experimental-strip-types evals/media/run-vision.ts --plan
```

The plan performs no credential read, provider request or file write. Only after explicit
media-spending authorization, use the existing server environment through Node's `--env-file`
and run `--execute FIXTURE_DIR NEW_CAMPAIGN_DIR AUTHORIZATION_REFERENCE`. Do not paste keys
into shell arguments or chat. Do not commit the env or private campaign directory.

Three calls maximum: one per language, then one cancellation 250 ms after transport dispatch.
No retry; provider failure stops the remaining campaign. A semantic FAIL is recorded while
allowing the other language and cancellation to be measured. The bound is CNY20 total,
CNY6.32 held before each dispatch (full 1,048,576 input tokens at CNY6/M plus 1024 output tokens
at CNY24/M rounds up to CNY6.32). Discounts/free quota are not assumed. The very conservative
full-context hold is not an expected bill or claim that the tiny cards consume that context.

The isolated file journal implements the existing budget RPC seam for this operator campaign,
not production Supabase or customer accounting. `fsync` precedes every reservation/dispatch/
usage/settlement acknowledgment. An exclusive new directory prevents rerunning that campaign;
a crash leaves full holds and requires inspection, never automatic replay or a replacement
campaign. An operator must not create a second campaign under this three-call authorization.
Only complete usage within fixed bounds permits a conservative tariff debit; unknown usage,
cancelled calls and unrecognized dimensions keep their full hold. Actual supplier billing
remains unknown. The runner's authorization reference records prior user authorization; a
CLI argument by itself does not grant it. No top-up, purchase or account change is included.

## Data flow and region

The process reads local self-authored PNG bytes, sends them inline over the existing allowlisted
HTTPS endpoint, receives bounded JSON and releases its references when complete. The adapter
writes no file; this is not forensic memory erasure. The runner explicitly saves only synthetic
fixtures outside the repository and closed metadata receipts/hash/field scores in its private
campaign directory. No credential, raw provider body, reasoning or arbitrary error body is logged.
Fixture files can be removed locally after inspection; that does not delete supplier-side data.
No remote provider file object is created, so no file deletion request or fake deletion receipt
is emitted. Supplier retention/deletion and upstream cancellation remain unverified.

The endpoint is `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`, documented
as Beijing API access. Physical/internal processing and storage region are unknown until
supported by separate evidence; DNS/endpoint/account usability does not establish them.
Server credentials stay in the existing environment; this PR neither copies nor changes them.

Official references checked 2026-09-22:

- [Vision input format and supported model families](https://help.aliyun.com/zh/model-studio/vision)
- [Qwen3.7 model](https://help.aliyun.com/zh/model-studio/qwen3-7-plus)
- [Published pricing](https://help.aliyun.com/zh/model-studio/model-pricing)
- [Model release mapping](https://help.aliyun.com/zh/model-studio/newly-released-models)

These references motivate a candidate, not a measured media qualification. The chosen pinned
model is `qwen3.7-plus-2026-05-26`; if the shared profile changes, revise and reapprove this
campaign's model/pricing bounds before execution rather than silently using the new model.

## Downstream boundary and rollback

No path is yet qualified for #201/#216/#217. ASR, TTS, subtitles/read-aloud semantics, user
consent/identity binding, screenshot field provenance/correction and provider lifecycle proof
remain separate acceptance. Revert the added module/eval files to remove this development
slice; no deployed flag, schema, retained customer data or product behavior changes.
