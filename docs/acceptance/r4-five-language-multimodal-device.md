# R4 five-language multimodal device acceptance audit

Issue: AI-34/#36. Audit target: `main@954b719`.

This is an engineering-evidence audit, not a device trial, Provider conformance result, or R4 beta
approval. Its verdict is intentionally `blocked`: the repository supplies bounded fixture and
unavailable behavior, but no real image, voice, TTS, credential, region, retention, or device
evidence.

## Scope and traceability

| Boundary | Current evidence | What it does not establish |
| --- | --- | --- |
| Private media | AI-30 pure pre-adapter denial returns `media_unavailable` before upload or provider/delete activity | owner-authorized signed upload, TTL, malware/EXIF processing, object/provider deletion, or C3 lifecycle evidence |
| Image translation | AI-31 has 25 closed C0 synthetic locale/field fixtures (five locales × menu/address/money/station/ticket) and a closed synthetic correction | image OCR, CER, bbox/order quality, MT, TTS, user correction persistence, or raw-media policy flow |
| Realtime protocol | AI-32 freezes `opened -> tentative -> confirmed -> finished`, disconnect cancellation, authority, reconnect and an expiry fixture | WebRTC/SDP, AOQ issuance, ASR/MT/TTS, session cleanup, region/provider latency, or a device session |
| Translate UI | AI-33 supplies five-locale/RTL manual text/copy/clear and a disabled hold-to-talk control | microphone permission, audio recording, ASR, translation, TTS, Bluetooth/background behavior, or a speech result |

No row above can be combined to create a real multimodal path. Each remains fail-closed at its
own boundary.

## Five-language device and quality matrix

| Required slice | zh | en | es | ru | ar | Release result |
| --- | --- | --- | --- | --- | --- | --- |
| Image OCR CER / bbox / rotation / low-light | not measured | not measured | not measured | not measured | not measured | blocked |
| ASR WER / noise / named entity / number accuracy | not measured | not measured | not measured | not measured | not measured | blocked |
| Translation adequacy / human rubric | not measured | not measured | not measured | not measured | not measured | blocked |
| TTS first audio / intelligibility / exact screen text | no output | no output | no output | no output | no output | blocked |
| Camera/microphone/Bluetooth/background permission | not implemented | not implemented | not implemented | not implemented | not implemented | blocked |
| UI fallback / Arabic RTL | browser fixture only | browser fixture only | browser fixture only | browser fixture only | browser fixture only | degraded only |

The worst slice is every physical-device/Provider slice: none has a measured result. The five
locale labels in AI-31 and AI-33 are not a five-language device evaluation.

## Eight dimensions

| Dimension | Result | Evidence / gap |
| --- | --- | --- |
| Functional | blocked | no accepted image or push-to-talk translation can start; manual text is intentionally not translated |
| Interface | degraded | five-locale/RTL unavailable and local manual-text controls are verified; no partial/final transcript or playback path exists |
| Data | blocked | no server-verified actor, PolicyReceipt, private object, raw-media TTL, correction persistence, or deletion receipt exists |
| Security | degraded | C3 media and unauthorised realtime creation fail closed; local Supabase RLS runtime and a live provider/credential boundary are unrun |
| Performance | blocked | no OCR/ASR/MT/TTS latency, session/reconnect, cost, or device resource measurement exists |
| UX | blocked | desktop/390px/Arabic fallback QA exists, but not physical-device accessibility, consent, interruption, permission denial, or correction UX |
| Observable | blocked | no content-free production trace, provider metric, deletion observation, cost budget, or release observation window exists |
| Compliance | blocked | no approved provider/region/DPA, C3 retention/deletion policy record, voice/media consent implementation, or rights evidence exists |

## Red-line evidence

| Suite | Fixture count | Runtime invariant | Observed result and limit |
| --- | ---: | --- | --- |
| RL-04 | 25 C0 translation fixtures plus 1 UI unavailable fixture | no unsupported translation/TTS result is rendered; missing synthetic fields stay missing and the UI shows no translated text/audio | 0/26 observed fixture violations after the named suites; this does not measure OCR, ASR, MT, TTS, or user adequacy |
| RL-06 | 1 media denial fixture | without server-verified owner/policy/provider receipts, private-media creation returns `media_unavailable` before any provider action | 0/1 allowed paths in the bounded fixture; this is not an end-to-end C3 deletion or region test |

The AI-32 RL-07 transport/secret boundary also remains fixture-only and is not evidence that a
future live transport is safe.

## Promotion, observation, and rollback

Neither DeepSeek nor Qwen is promoted by this audit. The accepted fallback remains manual text or
unavailable. Before R4 can be `accepted`, an authorized release owner must provide a named
provider/region/purpose/retention record; five-language physical-device recordings and human rubric
with worst-slice results; OCR/ASR/entity/number/adequacy/latency/cost measurements; consent,
permission, interruption, reconnect, final-only persistence and deletion traces; C3 policy and
provider/object deletion receipts; independent security evidence; and a named observation window.

Rollback is already executable: keep the modality disabled, retain the AI-33 local manual fallback,
and revert only this audit if its evidence summary is superseded. No provider account, device data,
raw media, persistent session, or public capability was created.

**Verdict: `blocked`.** Current tests prove truthful fixture and unavailable behavior, not an R4
multimodal beta or production release.
