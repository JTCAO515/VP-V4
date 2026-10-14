# AGENT-007 C0 speech producer evidence

Scope: #200 independent ASR/TTS C0 producer; no full parent closure.
Worktree: `/Users/jtsm5p/Documents/Codex/VP-V10-worktrees/agent007-speech-20261014`.
Branch: `codex/agent007-speech-20261014`.
Actual base: `02d101c8c5c438ea4573dd118947fa3358b1647c`, initial clean.
`git diff 02d101c8 1b8f372e --stat` returned no differences; actual remote QA
branch read returned `1b8f372eaac378fb91844f48dc0a4bcf7543907a`.
Stable source: `963c46f801ccf5c877a4498a385e4df47890c89f` (first invokable source
`b2d888267bcb3af728f8c7593c6643f0fba4f06d`). Subsequent evidence-only commits
reuse the same source bytes and validations.

## Actual local evidence

| Command / observation | Result |
| --- | --- |
| `node --version` | PASS v26.8.2 |
| `pnpm install --frozen-lockfile --offline` | PASS108 existing packages reused;0 downloaded;1.4s; package/lock unchanged |
| `node --experimental-strip-types --test tests/contract/agent-speech/speech.test.ts tests/contract/media/synthetic-vision.test.ts` | PASS23 tests,0fail,0skip (15speech＋8vision),106.84ms |
| `pnpm typecheck` | PASS full tsc --noEmit |
| `pnpm lint` | PASS source policy lint840files |
| `pnpm docs:check` | PASS plan/archive/documentation checks |
| `git diff --check` and implementer diff review | PASS new leased paths only |
| Existing #200 and PR484 official CLI metadata | #200OPEN; PR484MERGED55c6c446, vision only; no duplicate speech implementation found in existing media source |
| Git remote/auth/network read | origin JTCAO515/VP-V4; existing keyring account JTCAO515; issue/PR/ls-remote successful; no credentials changed |

No platform approval rejection occurred. Initial node_modules was absent; attempted
older-WT dependency/guessed suite reads were absent, not permission failures. Main
explicitly authorized installing existing frozen dependencies in this worktree;
offline cache supplied them. No add/install of new packages or global changes.
Requested model is official gpt-6.1-sol/medium per dispatch; this tool session has no
effective model/reasoning/tier fields, all effective values UNKNOWN.

## Tested behavior and limits

Scripted transports invoke actual `invokeSyntheticSpeech`, not an alternate mock
producer. Both locales construct ASR multipart and preserve TTS read-aloud text,
names/digits/negation/date/address/subtitle line breaks. Receipt binds input digest,
actual local seconds/characters, reported duration usage or unknown, output duration
and first response-byte latency. These are wire observations, not acoustic scores.

Negative gates include C2/fake eligibility, URLs, extra keys, unsupported locale,
timeout/ID/text limits, ill-formed Unicode, silent/truncated/oversized/wrong-format
WAV, malformed JSON/UTF-8/usage, partial/refusal/inconsistent segments, wrong language,
duration mismatch, HTTP status/MIME/errors, repeated budget admission, preabort,
timeout, uncooperative transport, late response cleanup and stalled-body cancellation.
Valid reported usage is retained even when output is rejected. TTS binary exposes no
usage; cost remains unknown instead of inferred zero. Budget is the existing CostGuard.

Source SHA256:

```text
4bd1a8a8a16c18475bab521f935c48aae807c06b9e6a5da9b22f1e1d9af4cb9e index.ts
97356612aec499d20086f64cb2532f09f58a690d9d0893e7641badd0575e0258 wav.ts
103ea3594b83482895f6e2bb0640b7460a392e3428e5eead6ed7e0e631bd5171 speech.test.ts
```

## Consumer / integration and remaining acceptance

Independent invocation needs no old-file changes. API and constraints live with
source in `lib/server/media/speech/README.md`. Fixed OpenAI whisper-1/tts-1 wire
candidates were checked against official [transcriptions](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)
and [speech](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create)
references. This is not a change to ModelGateway profiles or a provider recommendation.

- C2 unavailable: no trusted current-source/purpose/recipient dispatch port. Caller
  booleans cannot authorize speech. Main must coordinate authoritative shared ports
  and exact old-file leases before any user-data consumer hookup.
- No route/worker/native/registry/schema/config writes, mic/upload permission,
  credentials, provider live call, spend, logging media, persistence or charging.
- Real provider/region/retention/deletion/fee receipts, acoustic noise/truncation
  quality, pronunciation/hearing review, real audio cleanup, runtime and device:
  **UNRUN**, outside this authorized C0 scripted validation.
- User capability remains disabled. Syntactically correct candidates can be
  acoustically wrong; neither transcript nor WAV establishes media qualification.
  Internal buffers are cleared and response streams cancelled; runtime/Blob copies
  and supplier secure deletion are not proven. Output ownership transfers to caller.
- Build/browser/device: **UNRUN**, no existing runtime/UI entry modified.
- Remote CI/independent formal review/normal QA merge: handled against final PR head
  by Main; local checks do not stand in for those gates. #200 remains OPEN.
