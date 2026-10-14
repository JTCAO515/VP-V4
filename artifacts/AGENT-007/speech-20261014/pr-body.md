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
- **After:** actual new producer passes15speech tests plus8unchanged vision regressions,
  23/23 with0skip. Full typecheck, lint, docs and diff checks PASS.
- Source tested:963c46f801ccf5c877a4498a385e4df47890c89f; final evidence-only head
  retains identical source bytes. Evidence:artifacts/AGENT-007/speech-20261014/evidence.md.
- No provider call, fees or user data. Real acoustic quality, hearing review, supplier
  receipts, C2 dispatch, worker/consumer runtime and device are UNRUN. #200 stays OPEN.

## Merge Danger

**Door:** two-way

**Blast Radius:** speech

New leased directories only. No old provider protocol, worker, native, policy/SQL,
registry, package/lock or shared configuration changes. No default network transport,
keys, retry, persisted media or ModelGateway qualification. Fixed protocol candidates
use official transcription/speech wire docs; PCM subset may reject real outputs.
Caller owns returned transient audio; secure runtime/provider deletion remains unproven.
