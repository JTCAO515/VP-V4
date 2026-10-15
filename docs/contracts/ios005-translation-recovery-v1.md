# IOS-005 translation submission recovery v1

Issue #216 already requires recovery of the original durable submission after backgrounding, reopening or an uncertain acknowledgement. This extends that consumer within the existing current-input text authority. It does not enable any provider, policy, budget or environment.

## Original identity and local storage

Before the first translation POST, retain and physically read back one immutable metadata record under the original endpoint, owner and mobile epoch. Its identity contains exactly `threadId`, `turnId`, `idempotencyKey`, `policyId`, `noticeHash`, `sourceLocale`, `targetLocale`, and `inputHash`. IDs are canonical UUIDs, hashes are lowercase SHA256, and locales are opposite zh/en. `inputHash` hashes the exact UTF-8 bytes of the user's original text.

The fixed, bounded Keychain journal uses the existing vault protection. It contains no original text, translation, Trip fields, prompt, audio, token or credential. A generation is a live fence and is not a persisted recovery identity. Another owner, endpoint or epoch cannot read or submit from it. Only exact-service not-found establishes local absence; corruption, access failure and a failed physical write/readback block submission.

Backgrounding hides private presentation and cancels polling without erasing the durable identity. Recreating a Store restores that identity before admitting a new submission. Missing acknowledgements, transport errors, policy changes, missing recent history or a cancelled local task do not establish a server terminal result.

## Read-only recovery port

`GET /api/translate/recovery/{turnId}` accepts exactly one each of `threadId`, `idempotencyKey`, `policyId`, `noticeHash`, `sourceLocale`, `targetLocale`, and `inputHash`. No text enters the URL. The response has exactly `version: 1`, `kind: translation_recovery`, `identity`, `state`, and `phrase`. The identity has the eight fields above; `phrase` is a qualified original translation phrase or null. States are `unknown`, `pending`, `translated`, `cancelled`, `unavailable`, and `needs_review`.

Positive states require current actor/session, consent/policy/notice, active original thread, original Turn and idempotency binding, language and original text hash. Recheck eligibility and content before publication. Reuse ordinary authenticated RLS metadata and the original protected text readers; never a service-role bypass, new grant, changed CoreTurn reader, or caller-supplied private history.

The existing exact text reader does not return policy/thread/status. The policy-scoped recent-20 reader can establish those associations when the original Turn is in its bounded window. A missing or out-of-window association remains `unknown` with no private phrase; it is never proof of non-submission, cancellation, success or zero cost. The saved-history v2 translated-only wire is unchanged. Permission, policy and transport failures retain their errors instead of becoming terminal unavailability.

Recovery never invokes submit, worker, model, admission or budget mutation. Existing read RPCs use Supabase's HTTP POST transport; the public recovery endpoint and client recovery flow remain read-only GET. A source-backed terminal unavailability is distinct from an HTTP read error.

## Completion and lifecycle

Only a strictly decoded, current, matching positive terminal read can complete the original journal with compare-and-swap. Pending, unknown, stale identity, unavailable transport, wrong hash and a generic cancel HTTP acknowledgement do not complete it. Cancelling the original Turn requires subsequent qualified readback before local completion.

Explicit local abandonment is a separate action, with a clear warning that it neither undoes the server request nor proves that work stopped. It does not send a new request or manufacture a completion receipt. Account/endpoint/epoch, withdrawal, selected-data deletion, explicit logout and account cleanup keep their existing authority and privacy boundaries. Main integrates the journal with the existing fixed metadata inventory and cleanup hooks; no arbitrary Keychain enumeration or raw-content export is introduced.

## Evidence boundary

Test actual Store recreation, lost acknowledgement, background/foreground, zero additional generation submits during recovery, storage faults, actor/epoch/policy changes, exact UTF-8 hashes, wrong/late receipts, cancellation uncertainty and ordinary-role isolation. Synthetic transports and vaults are labeled; managed Auth, target environment, provider quality, physical devices and VoiceOver require their own evidence.
