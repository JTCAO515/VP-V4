# VPJ-26: current-input field translation (v1)

Related to #216; S4 incremental implementation, not full Issue acceptance.

## User result and boundary

The native translation/address-card/safe-phrase entry opens a zh/en text form. A user types a short phrase or pastes an address they explicitly chose. An accepted request is polled for up to 60 seconds, then can be refreshed manually. A structurally valid answered result shows the unchanged original, target translation, model-generated back-translation and a scrollable Dynamic Type large card.

No location acquisition, Trip read/write, private memory/history context, media provider, image, microphone or playback is introduced. Direct selection from a Trip item is not yet wired; paste/type is the implemented address input. No medical/legal or certified translation claim is made. Back-translation is generated in the same model call and is not independent validation.

## Existing authority and execution

- `GET /api/translate/policy` and `POST/DELETE /api/translate/consent` use the existing current-input text policy, notice hash and consent. The UI identifies its recipient and processing region, renders the actual notice and explains that withdrawal also applies to current-input Ask.
- `POST /api/translate` accepts exactly `threadId`, `turnId`, `idempotencyKey`, `policyId`, `sourceLocale`, `targetLocale`, `text`. UUIDs, opposite zh/en directions, 600 UTF-16 source units, bounded JSON body, controls and bidi override characters are checked. Caller-supplied context/owner/location fields are rejected.
- The server creates a versioned translation instruction containing quoted JSON source data, then delegates to existing `nativeTextHTTP`/`submit_text_turn`. Native bearer/session fencing, policy validation, idempotency, retained content, worker dispatch authorization and durable budget remain authoritative. No direct model transport, policy provisioning or new charge path exists here.
- Deployment must have an enabled **current-input** text policy plus its compatible current-input worker and bounded budget. A grounded/task-context worker or media qualification result cannot substitute. Default closed/production restrictions of the native text API remain unchanged. This PR does not activate any deployment/provider.
- The existing text protocol still returns outer outcome/text. For `answered`, the text must contain exactly `{translation,backTranslation}` JSON. Only that shape is projected into a large card. Partial/clarification/blocked/failure or changed numeric tokens produce no card. Numeric tokens include signs and decimal/group separators; this is a conservative structural check, not verification of negation, currency, place or allergy meaning.
- `GET /api/translate` projects translation-tagged records from the existing **20 most recent text requests**, not an unbounded saved-phrase library. Other Ask content is filtered from this response and never sent to a provider. Reads use the existing policy/session checks and do not reserve generation budget. Cached results exist only in the active view's memory; no new offline store/retention contract is introduced.
- Native uncertain-send retries preserve IDs and input within the active view. Explicit server cancellation uses `POST /api/translate/turns/{turnId}/cancel`. Leaving the view/background stops polling, not necessarily the already accepted worker. Re-entering reads recent server results; there is no new durable submission-recovery subsystem. Actor change/background clears local text and the card.

## Files and coordination

Primary: `lib/server/media-translation/text`, `app/api/translate`, native `Features/Translation`, direct contract/native tests and synthetic evaluation cases. Adjacent `NativeSession.swift` adds only the fenced translation request method; `Navigation/Capability.swift` connects the three existing text/card entry points; `project.pbxproj` registers the two module files and one focused test file. #363 and #240 confirmed no overlapping in-flight edits; dedicated E216 object IDs preserve existing map registrations. No global handoff/team-plan edits.

## Acceptance and rollback

See [verification](../../artifacts/VPJ-26/verification.md) and [unrun](../../artifacts/VPJ-26/unrun.md). Deterministic stubs establish contracts and state behavior, never actual translation quality. Revert this isolated PR to remove the consumer; it has no schema migration, provider activation or Trip changes. Existing retained text follows its original consent/deletion rules.
