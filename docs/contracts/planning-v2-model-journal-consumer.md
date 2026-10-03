# Strict local journal consumer — no send or authority

2026-10-03. Implements fixed Main-approved `4fde99b9e4165fbdbee1731efae8cd6a3d0a7af3:tests/preparation/planning-v2-model-journal-interface.md` plus Main's explicit server-time clarification: all non-null record timestamps serialize UTC exactly3 fractional digitsZ; internal SQL timestamptz precision/lease comparisons stay unchanged.

Pure exports `parsePlanningV2ModelJournalRead(raw,expected)` and `parsePlanningV2ModelJournalWrite(raw,expected)` return strict immutable local-record data, exact `{kind:"blocked"|"conflict"}`, or null for malformed/mismatched data. There is no RPC, I/O, fallback/newrequest/send/permit/SQL change.

Expected has exactly six fields: canonical13tuple `binding`, canonical UUID `requestId`, lowerSHA256 `requestDigest,payloadDigest`, and `outputDigest,usageDigest` (both null for phase-only read, or both lowerSHA256 for exact output read). These are independently captured structural expectations, not current SQL authorization. Successful raw tuples and all identities/digests must match exactly; provider is literalqwen and model existingregisteredqwen.

Read is exactly19 fields; write is exactly those19 plus booleanreused. Raw failure is exactlyonekind; unknown/extra fields reject. providerOriginVerified:false, executionAvailable:false, readyForPublication:false, reconciliationRequired:true are mandatory literals, never promoted or inferred. Phase is actual string intent_saved/send_ack_recorded/response_recorded; revision is safe positive integer at least the phase's first revision (1/2/3), plus one when unknownAt is present. Unknown is orthogonal sticky metadata and gives no retry permission.

intentRecordedAt always UTCms; unknownAt null or UTCms. Intent phase has null ack/response timestamps, observations and output. Ack phase requires timestamp+closed send_ack local observation and null response/output. Response phase requires both recorded timestamps/closed matching local observations and a valid closed model-output wire. Every local observation is exactly6 keys, source local_observation, fixedschema/kind and same requestID/digest, with strict UTCms time. Server/local clocks are not conflated; no undocumented ordering/freshness is inferred.

Response wire is revalidated by the new canonicalUUID output decoder, including independent13tuple, usage identity, actualMicros knowninteger/null rejection, selection enum, recomputed output/usage hashes and false flags. Exact-output expectations must match both recomputed hashes and require response phase. Captured binding/observations/output are detached/frozen; data can survive caller mutation without being interpreted as provenance.

Contract tests3/3PASS cover allphase/null layouts,19vs20 keys, outputexact/phase-only reads, blocked/conflict, key/type/flag/timestamp/request/oldtuple denial, observation-source denial, outputtamper/crossattempt, stickyunknown representation and immutablecapture. SQL actual goldens, internalmicrosecond→wiremillisecond example and lost-ack exactreadback are pending a fixed559060000 runtime snapshot. No fakeSQL or schema-only fixture counts as those integration proofs.


## Actual complete SQL pre-fix checkpoint

Fixed unmerged `e039e357035ba45d9a628aad73a5bf20e3cae311` actual050000/060000 was loaded with baseb930. Newprep test proves actual19/20wire,controlledlost-write-returnexactreadback,serverUTCms/null/composite microsecond case,unknown/originallease/currenttypedsource andsettledamount conflict throughactualprivatefunctions andstrictTSconsumer. This supersedes the earlier missing-journal UNRUN for those exact localrecord cases only.

A separate defect reproduction showsMain'sNULLdigestbypass in e039:SQLvalidatorNULL permitsadoption,whilestrictTSconsumer rejects. E039is **not** fullyaccepted;finalfixedSQLdifference remainspending559source. NoSQLchanged here; canonical/otherunaffectedmatrices reused.


## Fixed rejection difference

Unmerged0d949ad96e2bcb46ae712c9507df69812217fb8c actualSQL was testedonlyfortheaffectedNULLdifference:strictfalseforindividual/bothNULLdigests,blockedresponse/closedTSfailure,unchangedjournalfullrow/ledger,actualtriggerexceptionrollback. Target1/1PASS5488ms;legal3groupsarepreciselyreusedafterexactdiffreview. Thissupersedese039'sunsafeNULLadoptionresultonlyonthisfixedsource. Providerorigin/permission/completion/target/fullacceptanceremainoutside this consumer.


## Formal current-checkout union

On unionbase fixed627head570bbf0a (unmerged atinitialrun), actualcheckout060000+050000/migrationhistory andnormalTSimports replacedhistoricalprepsources. Threeformaljournal/canonicaltests are registeredinexistingpostgreslane; noGitshow/gzipruntime. Actualregisteredlane30files228/228PASS0skip includesfresh19/20wire+NULLrepaircases; priorpre-reviewevidence remainshistorical. Dependencymerge/review/CI/providerorigin/paidexecution/completion/target/fullparent gates remainseparate.
