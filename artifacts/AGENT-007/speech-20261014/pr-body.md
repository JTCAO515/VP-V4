## Summary

AGENT-007/#200 had a bounded vision producer but no invokable speech producer.
This adds C0 synthetic ASR/TTS with injected transport, CostGuard admission, strict
WAV/JSON/usage bounds and prompt cancellation. Output remains a candidate with
unknown fees and disabled user capability; C2 always refuses before dispatch.

```text
invokeSyntheticSpeech
  validate C0 / exact zh-en input / bounded PCM WAV or text
  existing CostGuard.admitModelStep
  injected bound ASR multipart or TTS WAV transport
  validate complete bounded output / preserve usage or unknown
  candidate or closed failure; abort discards late output
```

## Evidence

- **Before:** PR484 delivered only vision; no ASR/TTS source under existing media.
- **After:** initial producer passed23/23 speech＋vision checks. Formal review found
  threeP2s; fix2575074c passes22/22speech checks including complete own-key/accessor
  rejection, monotonic deadlines and bounded empty/read counts with event-loop yield.
  Full typecheck/lint/diff PASS; unchanged vision and docs evidence reused.
- Main's exact CI dependency ec29bdf9 is imported: static-output tests now select
  their required build. Main's24CI governance checks are reused against identical bytes.
  Original7db Quality failure (missing .next/server/app/journey.html) is retained.
- Evidence:artifacts/AGENT-007/speech-20261014/evidence.md.
- No provider call, fees or user data. Real acoustic quality, hearing review, supplier
  receipts, C2 dispatch, worker/consumer runtime and device are UNRUN. #200 stays OPEN.

## Merge Danger

**Door:** two-way

**Blast Radius:** speech

Speech source writes stay in new leased directories. The only shared changes are
Main's explicitly authorized exact CI selector/test commit; no leaf edits to it.
No old provider protocol, worker, native, policy/SQL, registry or package/lock changes.
No default network transport,
keys, retry, persisted media or ModelGateway qualification. Fixed protocol candidates
use official transcription/speech wire docs; PCM subset may reject real outputs.
Caller owns returned transient audio; secure runtime/provider deletion remains unproven.
