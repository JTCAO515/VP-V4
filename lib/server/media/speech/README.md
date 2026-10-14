# Synthetic speech port — synthetic-speech/1

`invokeSyntheticSpeech(request, budgetTurn, boundTransport, signal)` is an invokable
server-only C0 ASR/TTS candidate producer. It imports the existing CostGuard;
the enclosing operator owns monetary admission, settlement and reconciliation.
It does not change ModelGateway eligibility or provider protocols. A caller's
`c0_synthetic` label is a classification for operator-controlled synthetic inputs,
not proof that arbitrary user audio is synthetic. Do not expose this port to a route,
worker or client accepting user-supplied media. C2 has no trusted dispatch port
here and always returns `DATA_POLICY_BLOCKED` before budget or transport.

## Contract and compatibility

- Request: exact requestId (ASCII identifier, max64), dataClass, zh/en locale,
  timeoutMs (1–60000), task and either wav or text. No URL, permission boolean,
  caller-selected voice/model/endpoint, translation, microphone or upload path.
- ASR: 0.1–60 second mono PCM16 WAV, 16/24 kHz, complete RIFF lengths and bounded
  bytes; silent buffers reject. Copied bytes and SHA bind admitted input. Sends
  multipart `whisper-1`, language zh/en, verbose_json, temperature0, synthetic.wav.
- TTS: nonblank well-formed text, max2000 UTF-16 units, controls rejected; input
  preserved exactly including line breaks. Sends `tts-1`, alloy, speed1, WAV.
  Returns complete non-silent 0.1–60 second PCM WAV in the same restricted subset.
  Other codecs, stereo, other rates and streaming RIFF placeholders are unavailable.
- Injected transport accepts the fixed official endpoint and POST body and returns
  a Response. It must be bound to its endpoint, refuse redirects, propagate abort,
  and never log audio/text. There is no default fetch, runtime key lookup, fallback
  or retry. Scripted transports invoke this same production producer.
- ASR JSON must be <=64KiB, UTF-8, transcribe task, matching English/Chinese language,
  nonempty bounded text and finite duration within0.1s of the actual input WAV.
  A missing usage object remains unknown; a present usage object must have exactly
  duration type and finite seconds within (0,60]. TTS binary has no reported usage.
- Receipt keeps local input duration/Unicode character count separately from
  reported usage, output duration, first response byte latency and dispatch attempt.
  Dispatch is not supplier receipt/charge evidence. Cost and supplier retention
  remain unknown; supplier deletion/upstream cancellation remain not_verified.
  First byte is transport latency, not audible playback latency.
- Closed failures: INVALID_INPUT, DATA_POLICY_BLOCKED, BUDGET_EXHAUSTED,
  TIMEOUT_BEFORE_OUTPUT, PROVIDER_UNAVAILABLE, MODEL_OUTPUT_INVALID, CANCELLED.
  Partial, empty, corrupt and unsupported outputs never become candidates.
- Abort races return promptly even if transport ignores the signal. Late responses
  are cancelled; aborted body readers are cancelled and cannot return output.
  Owned input/read buffers are cleared on exit. No files/cache are created.
  This is not secure-erasure proof for runtime/Blob copies or supplier storage.
  Successful output is caller-owned; caller must clear it when finished and obtain
  separate authority before any persistence/cache/playback use.
- There is no idempotency ledger or automatic retry here. requestId is a correlation
  key, not provider idempotency. Unknown costs/outcomes require operator reconciliation.

## Acceptance boundaries

The targeted tests verify actual adapter behavior using scripted Responses, including
zh/en names, dates, digits, negation, addresses and subtitle text preservation.
They do not measure acoustic recognition or pronunciation. Non-silent noise is not
detectable as valid speech through WAV validation. A syntactically valid transcript
can still be inaccurate; a valid WAV can still be acoustically truncated. Candidates
are never a media qualification or a Trip update. Live source/model/region/budget
qualification, noise/truncation quality corpus, supplier receipts, hearing review,
real cleanup, device and runtime acceptance remain UNRUN; #200 remains open.

No old-file hookup is necessary for independent invocation. Main must obtain exact
leases before adding a worker/registry/consumer path. In particular C2 requires an
authoritative purpose/recipient/current-source dispatch port, not a new boolean.

Protocol reference inspected2026-10-14: [transcriptions](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
and [speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create).
These document wire candidates; account availability and live capability were not tested.
