# Five result lifecycle — server/native wire checkpoint

2026-10-03; #560 full feature batch. Base currentmain b77a134a; unique result-domain110000 migration reserved. This checkpoint freezes content/reader shape for parallel Native implementation, not schema-only feature completion. No generic artifact editor: user edits mean existing Trip/Proposal/input/Memory changes invalidate currentness.

## Closed content union

All generated content is inert `actions:[]`; no URL/HTML/action fields or confirmation payload. Comparison and proposal-reference/1 retain existing shapes.

- `journey-draft/1`: exactly `{schemaVersion,title,summary,draft,source,actions}`. `draft` uses the existing TripSnapshot `{version,title,days}`; days/id/date/optionaltimeZone/items and items/id/dayId/title/optionalstartsAt/endsAt stay the existing domain vocabulary, strictly closed, ≤30 days/50itemsperday. Draft is immutable preview, never a second editable Trip. `source` exactly one of `{kind:"task_output",taskTurnId}`, `{kind:"trip_snapshot",tripId,tripVersion}`, `{kind:"proposal_preview",proposalId,proposalRevision}`. Actual source adapter must match the typed draft to the existing completed Task output/Trip snapshot/Proposal preview; no confirmation operations copied. Null-Trip task draft uses version0; linked Trip/version and Proposal eligibility remain domain-owned.
- `decision/1`: exactly `{schemaVersion,title,summary,comparisonRef:{artifactId,revision},state:"pending"|"chosen",chosenOptionId:string|null,actions}`. pending requiresnull; chosen requires explicit owner selection+CAS and eligible ownedcomparison existingoption.id. Service/model cannot set chosen by inference. Display text is projected from the source comparison and selection, not model freeform. A dedicated choice operation is part of this batch, not a generic edit API or Trip confirmation.
- `practical/1`: exactly `{schemaVersion,kind:"translation",sourceTurnId,sourceLocale:"zh"|"en",targetLocale:"zh"|"en",translation,backTranslation,actions}`. Locale pair differs. Only the actual existing savedtranslation producer/readback/projectTranslation is supported; text must equal its authorized completed projection. No arbitrary tool/URL or copied UserArtifact material. Numeric/uncertainty constraints are reused.

## Shared envelope and source basis

Generic exact read uses the existing eleven-field result envelope: kind/artifactId/revision/currentRevision/current/historicalReadable/lifecycle/source/basis/content/createdAt; source retains current eightfields taskId/taskTurnId/goalId/goalVersion/inputMessageId/inputSequence/tripId/tripVersion. Native HTTP generic endpoint planned `/api/results/native/v2` (GET exact artifactId+revision), outer `{version:2,data}`. No latest/globalfallback. Legacyv1comparison and dedicated proposal readers remain failclosed/compatible.

`basis` exactly `{memories:[{id,revision}],evidence:[{factId,assertionId,assertionRevision,city,scene}]}`. Evidence descriptor is identical to559v6. factId is the actual canonicalknowledge fact string, assertionId the canonical UUID, assertionRevision the actual publication revision; city/scene are the existing published-corpus scope enums. Empty array means no recorded evidence, not model-invented proof. Existing EvidencePack2 statementId maps to knowledge factId, publicationId to assertionId; revision must come from the same authorized canonical knowledge row, never from a quote or guessedsourceversion. Retrieval/publication/source withdrawal/current eligibility is rechecked by the server. No independent new evidence library or copiedsourcebody.

Currentness extends the reused Task/input/goal/Trip/Memory gates across allfive: nestedcomparison/draft/proposal/translation/evidence references must remain eligible; no oldversion confirmation. Historical readability remains independent and content is hidden on actor/consent/source withdrawal/deletion. SQL CAS/revisions/events, generic exact reader/index/search/export/delete and three typed adapters are thisbatch implementation work. Native owner uses one safe five-case renderer from VP/Journeys/Library with exact sameID/revision; supportedWebcomparison stays compatible.

## Development closure

The present parser checkpoint is not the whole implementation: actualwriter/read/index/export/currentness/choice+nativeconsumer remain to ship. Target/provider/human/device facts are recorded later and do not block code-complete development closure; core missingcode still keeps560Open. Necessary permission/data/CAS/source-revoke checks run as targeted engineering work; requiredmergeCI is separate.

## Frozen decision owner operation / Native handoff

`POST /api/results/native/v2/decision`, application/json, native credentials; Cookie/Origin and URL query parameters forbidden. Body has exactly four mandatory keys:

```json
{"artifactId":"canonical UUID","expectedRevision":1,"operationId":"new UUID idempotency key","optionId":"existing eligible comparison option.id"}
```

expectedRevision1..999; optionId `[a-z0-9_-]{1,40}`. Native reuses the same body/operationId on transport retry, never generates a new operation automatically. Server calls only authenticated `choose_result_decision_v2(artifactId,expectedRevision,operationId,optionId)`, preserving existing owner/session/currentbasis and current eligible nestedcomparison, not model selection. Service publication cannot set chosen.

Success is exactly `{version:2,data:{kind:"selected",artifactId,revision:expectedRevision+1,reused:boolean}}`. It is an atomic immutable revision/CAS/event receipt; Native must GET `/api/results/native/v2?artifactId=...&revision=...` and render its actual chosen content, not infer it from the submitted option. Same exact operation returns reused:true while its resulting revision remains current/eligible. Changed operation content is409REVISION_CONFLICT; invalid/nonexistent option400INVALID_INPUT. Stale/ineligible decision returns200 `{version:2,data:{kind:"unavailable"}}` and requires clearing/refreshing, never fallback to latest or auto-changingCAS. Actor denial401UNAUTHENTICATED, unavailable/malformed response503RESULT_UNAVAILABLE. No confirmation material, generic artifact editor, Trip mutation or model action.

Exact/search/reference endpoints implemented here: GET `/api/results/native/v2` (mandatory artifactId+revision), `/v2/search` (query≤120,cursornullable), `/v2/task?taskId=...`, `/v2/trip?tripId=...`; allversion2 outer and currentactor/private-no-store. Search rows add known schemaVersion to existing ID/revision/title/summary/Trip tuple. Task/Trip discovery returns `{kind:"result_reference",artifactId,revision,taskId|tripId}` then exact GET, same ID/revision across pages. Legacyv1 endpoints remain unchanged.

Current source checkpoint: new110000 passes first localPG3/3 covering comparison/decision ownerCAS/idempotency/foreignowner/servicechosen-denial, taskdraft and actualsavedtranslation projection/hiding, schema/migrationACL. Existingdomains/supplementalTrip/proposal/evidence/rollback negatives and fullNativeconsumer integration are still thissamebatch work, not schema-only closure. Typecheckpassed. Native neednotwait for allremaining localchecks to implement this fixed operation.


## Final server compatibility details

Generic source inputSequence and Memory revisions accept safepositivebigint values (matching legacy domain), not an invented32-bit limit. Evidence factId/assertionId bothareactualcanonicalUUIDs; otherfields/scopesunchanged. Mid-choice sessionloss maps401. Publisher exactretry rechecks currenteligiblebasis before returning reused; withdrawn/changedsource cannotmanufacturea freshcompletionreceipt. Formal postgres testcase is `tests/integration/turn/five-result-lifecycle.test.mjs`, currentcheckout allmigrations/normalimports, no historicalfixtureSQL.


Server source adapters/persistence/lifecycle are now implemented in110000; taskdraft/Trip/proposal/translation contents are validatedagainsttheirrealtypedsource, newjourney/decisiondisplaytextisdomainprojected, evidencecurrentknowledgequalification/index/export/deleteallwired. Sameartifacttype cannotretargetonrevision;freshpublishretryrevalidatescurrentbasis. Whole560closurewaitsonremainingconsumer code (Native/context), nottarget/humanobservations.
