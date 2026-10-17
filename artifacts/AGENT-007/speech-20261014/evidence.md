# AGENT-007 C0 speech producer evidence

## Current review repair

Current speech source repair: `2575074c6a5d028b0843b5a9ec73d43daad88966`.
The earlier963c/b2d validation below is historical and retained, not the current
review-complete source. Main's dual-axis review found3P2 defects; this repair adds:

- Complete Reflect own-key closure, descriptor snapshot and accessor/inherited
  field rejection before reading request data. Symbols/hidden extras cannot dispatch.
- Monotonic elapsed deadline checks before dispatch, after transport, before/after
  each body read and before candidate return, alongside the async abort timer.
  Synchronous blocking transport and immediately ready microtasks cannot return a
  candidate after expiry.
- Max4096 body reads, max64 empty reads, no empty chunks retained and event-loop
  yield each64reads; limits reject and cancel the reader. Both late responses and
  stalled/read-loop cancellations discard output.

Actual delta checks:22/22 speech tests,0fail/0skip,164.16ms; full `pnpm typecheck`,
`pnpm lint` (840files) and `git diff --check` PASS. Seven new tests cover the review
negatives and event-loop cancellation; existing15 speech checks remain included.
Unchanged vision source/regression evidence is reused, not rerun solely for docs.
Repaired source SHA256:

```text
3f338c7d0835837604a30478bec3d3f1151c7f2b4f8047770a021fea4ec98d45 index.ts
89b3de7e3cc2af022950edd5ca5dfc81f28ccd55fd4fe72e71ab35405be762c9 speech.test.ts
```

Main explicitly authorized importing exact shared CI dependency
`ec29bdf9e998c69090c22d3c119ac05f9e0fe422`; local cherry commit
`33968428a1d3fa71689ae29250760d24aa7588d8`. Only its2files
`scripts/ci-change-scope.mjs` and `tests/unit/governance/ci-change-scope.test.mjs`
were imported, with `git diff ec29bdf9 HEAD -- <two paths>` empty. Main's24CI
governance/syntax/diff checks are reused against identical bytes; owner did not edit
shared code. The fix selects a build when static-output tests are selected.

PR702 original head7db Quality **FAIL** remains: `.next/server/app/journey.html`
was missing because old selector picked static tests without their build. It is not
a speech-test failure and was diagnosed/fixed by Main. No skip, weakening, workflow
edit, admin merge, credential/permission change or retry bypass. New remote gates
and formal delta review must be read against the updated exact head.

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
