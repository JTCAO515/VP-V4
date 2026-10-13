# VPV10-START-002 Native material outcome

Owned module only; shared hooks are NOT APPLIED. Base daa7bae44a660381fb3295d0d2afc327ea98d3ba.

PDF uses original NativePDFJournal.matches and NativePDFOperation.matches, original pending/confirmed/detail decoders, exact Trip head == resultingVersion, and the original operation's confirmationEventId. The full source tuple includes original command metadata/request+command+preview digests and proposal id/revision/digest. Logical selection and monotonic start survive same-operation retries. Actor/epoch/generation/scene/readability/expiry changes clear transient state; late callbacks cannot erase a newer selection. No source bytes/Task/new Trip writer/OCR/provider/metric sink/queue are created.

Screenshot has no protected selection/material lineage and is always unobservable; it retains continuation. Local confirmedReadback is an internal handoff, NOT protected measurement qualification. NativeJourneyMaterialOutcomeConsumer denies measurement while original protected source and complete lifecycle ports are absent. It does not wrap proposals as Result artifacts or change measurement Signals.

`tests/contract/journey-material-outcome/native/run.py` strictly compiles the real original PDF Document/Wire/Journal and exact extracted original App scope/protocol + Trip decoders/date helpers with Swift 6/warnings-as-errors. Synthetic metadata exercises real matches/decoder logic, no fake receipt model. 39 assertions PASS. Actual original writer HTTP, Files/Photos interactions, Simulator UI, device, target, accessibility and whole #203 acceptance UNRUN.

`shared-candidates/pins.json` pins six complete before/patch/after candidates: PDFIntakeStore/View, TripStore/View, ScreenshotReviewView and explicit PBX inclusion. Main must acquire exact holder lease before applying. Candidate render hook attaches to the ORIGINAL rendered confirmed Trip content. Confirm-recovery after process restart has no guarded current selection and remains unobservable. No persistent selection is restored from a journal.

`build-candidates.py` builds an isolated source COPY with the candidate hooks, own DerivedData, generic iOS Simulator destination and signing disabled; no Simulator is booted or borrowed. Final compile status/source pins appear in candidate-build.json after the run. This does not prove live integration or actual app UI behavior.

Main decisions remaining: protected original source acquisition/lifecycle composition and NativeDataScope-to-server-session association. NativeDataScope lacks sessionId; no session ID is invented. Server `material-outcome/contract.ts` was read as an internal draft only, not used to change accepted WIRE/Signals. Complete downstream source verification must acquire server actor independently.

Rollback: remove new module and omit un-applied shared candidates. Original writer flow is unchanged in this WT. No merge/Issue closure/production action performed.
