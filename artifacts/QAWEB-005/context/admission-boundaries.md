# PR #684 admission preflight alignment — 2026-10-13

Read-only consumer audit; no SQL, prompt, budget or production source edited.
Consumer baseline `3c3a9e10d314256dff3a3340ac3f0e0acfb86098`.
Main integrated prompt tested at source `vp-task-response-v2`, SHA256
`a905b79d2e0084a47bb227e60439d96034dc5b1bba8b8cea42ce349b8945187a`.
This is a prompt TEXT digest, not its file digest. Its UTF8 text length is 3724;
JSON string length 3747; singleton system-message JSON array length **3777**.

## Exact producer conditions before inserting/enqueuing a new Turn

1. Compute candidate prior history = `qa_history_v1(parent)->history` plus the
   parent's exact user and assistant pair. Keep canonical chronological order;
   select last 6 messages (3 complete pairs), then append new user input.
   Still qualify all upstream source IDs, roles, ownership/currentness and original
   7-pair/8-Turn/64-KiB upstream limits. Do not only validate the selected window.
2. Every new/prior user text: nonempty under JS trim and <=4000 **UTF16 units**;
   each assistant <=8000 UTF16 units. Existing `turn_private.valid_text` already
   uses the full JS whitespace set and sums `ascii(character)>65535 ? 2 : 1` over
   Unicode scalar values, so reuse it. Plain PostgreSQL `char_length` is NOT equivalent.
3. Sum UTF8 raw content bytes of the six-or-fewer selected prior messages plus
   new user text must be <=**16384**. Use `octet_length(content)` on UTF8 DB text.
4. Actual JS `JSON.stringify([{role:'system',content:P}, ...selected, newUser])`
   UTF8 bytes must be <=**32768**. This is a SEPARATE check because JSON escapes
   can expand one raw byte to six. Do not derive it from raw content bytes alone.

All checks must run before admission writes/queue creation and use the same locked
parent/task snapshot as admission. Idempotent replay of an already admitted identical
request must retain original behavior; never re-charge or enqueue a replacement Task.
Capacity refusal should be truthful and leave no new accepted/pending Turn behind.

## Main's conservative SQL formulation is valid for current prompt

Build a JSONB array containing only the selected `{role,content}` objects and the
new user object. Require both step 3 above and:

`octet_length(messages_jsonb::text) + 4000 <= 32768`

For PostgreSQL-valid UTF8 text, JSONB renders the same required string escapes as
JSON.stringify and adds formatting spaces. Property order does not affect byte length.
Therefore JSONB array byte length upper-bounds the compact JS array byte length.
The actual added system-object-and-comma overhead is **3776** bytes with the current
prompt (3777 singleton-array bytes minus 1). A 4000-byte reserve has **224 bytes**
margin before any JSONB whitespace conservatism. This deliberately rejects some
JS-acceptable edge cases; that is safe and should be described as a conservative
admission cap. Keep an executable assertion `systemArrayBytes-1 <= 4000` tied to
future prompt edits; do not treat 4000 as a timeless constant.

Keeping `turnId` fields in the SQL size array would be even more conservative,
but use exact `{role,content}` objects to avoid unnecessary refusals. Do not remove
spaces from `jsonb::text` via regex: spaces inside user content are real data.

## Exact JSON formula if SQL wants parity rather than a conservative bound

Let E(text) be JSON string interior UTF8 bytes (excluding enclosing quotes):
- Quote, backslash, BS, TAB, LF, FF and CR each cost 2 bytes.
- Other U+0000..U+001F cost 6 bytes (`\\u00xx`). PostgreSQL cannot persist U+0000.
- All other valid Unicode scalars cost their ordinary UTF8 byte length.
- `/` costs 1 (JS does not escape it); U+2028/U+2029 cost 3 each; emoji cost 4
  UTF8 bytes and 2 UTF16 units. No HTML escaping or NFC normalization is performed.

For n prior pairs, actual Main prompt bytes are exactly:
`3777 + 29*(n+1) + 34*n + sum(E(each selected content))`.
The 29/34 constants include each preceding comma and the empty user/assistant
object JSON syntax. More generally replace 3777 with measured system-array bytes.

JS can represent lone UTF16 surrogates, but PostgreSQL-valid UTF8 text/JSONB cannot;
those and NUL must be rejected before persistence. They cannot form a valid persisted
history source, so no SQL-equivalent stored representation should be invented.

## Minimal fixtures (current Main v2 prompt)

| Prior user | Prior assistant | New input | Raw selected bytes | Prompt bytes | Consumer |
| --- | --- | --- | ---: | ---: | --- |
| 4000 × 中 | a | 4000 × 中 | 24001 | 27870 | deny content |
| 4000 × 中 | a | 1461 × 中 | 16384 | 20253 | accept |
| 4000 × 中 | a | 1461 × 中 + a | 16385 | 20254 | deny by one byte |
| 4000 × U+0001 | a | 816 × U+0001 + ab | 4819 | 32768 | accept |
| 4000 × U+0001 | a | 816 × U+0001 + abc | 4820 | 32769 | deny prompt by one byte |
| 2000 × 😀 | a | 2000 × 😀 | 16001 | 19870 | accept (4000 UTF16/input) |
| x | a | 2001 × 😀 | 8006 | 11875 | deny (4002 UTF16/input) |

## Verification

New narrow fixture: `tests/contract/qa-agent-context/admission-boundaries.test.mjs`.
5/5 PASS against this owner's original prompt and 5/5 PASS against Main's integrated
v2 prompt using `QAWEB_CONSUMER_ROOT=/absolute/path/to/qaw005-main-20261013`.
It reproduces the review failure, exact/+1 content and escaped prompt boundaries,
emoji units, JSON scalar-length formula, and pinned 4000-byte reserve.
No historical 40-test matrix rerun. PostgreSQL producer preflight execution remains
with SQL owner; these are consumer/oracle tests, not a claim of database validation.
