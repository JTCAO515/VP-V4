from pathlib import Path
import hashlib, difflib, json
root=Path(__file__).resolve().parents[3]
out=Path(__file__).parent/'shared-candidates'
def change(path, edits):
    before=(root/path).read_text(); after=before
    for a,b in edits:
        if after.count(a)!=1: raise ValueError(f'{path}: expected unique seam: {a[:80]}')
        after=after.replace(a,b)
    destination=out/path; destination.parent.mkdir(parents=True,exist_ok=True)
    Path(str(destination)+'.before').write_text(before)
    Path(str(destination)+'.after').write_text(after)
    Path(str(destination)+'.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+path,tofile='b/'+path,n=0)))
    return {'path':path,'beforeSHA256':hashlib.sha256(before.encode()).hexdigest(),'afterSHA256':hashlib.sha256(after.encode()).hexdigest()}
b='ios/VisePanda/VisePanda/Features/'
pins=[]
pins.append(change(b+'Trip/NativeTripStore.swift',[
('            self.notice = "rejected"', '            self.materialOutcome.exit(.rejected); self.materialHandoff = nil\n            self.notice = "rejected"'),
('    private var confirmationKeys:', '    let materialOutcome = NativeJourneyMaterialOutcomeStore()\n    var materialActive = false\n    private(set) var materialHandoff: NativeJourneyMaterialOutcome.Handoff?\n    private var confirmationKeys:'),
('        self.scope = scope\n', '        materialOutcome.exit(.scopeChanged); materialHandoff = nil\n        self.scope = scope\n'),
('            self.confirmationKeys[keyID] = key\n', '            self.confirmationKeys[keyID] = key\n            if let selection = self.materialOutcome.selection,\n               let context = NativeJourneyMaterialOutcomeBridge.context(store: self, session: session, active: self.materialActive) {\n                _ = self.materialOutcome.confirmStarted(pending: pending, key: key, selection: selection, context: context)\n            }\n'),
('            self.notice = "confirmed"\n        }\n    }\n\n    func confirmSupported', '            self.notice = "confirmed"\n            self.materialHandoff = await NativeJourneyMaterialOutcomeBridge.confirmed(outcome: self.materialOutcome,\n                store: self, session: session, active: { self.materialActive }, receipt: result)\n        }\n    }\n\n    func confirmSupported')]))
pins.append(change(b+'PDFIntake/NativePDFIntakeStore.swift',[
('func load(_ url: URL, using session: NativeSession, expiresNoLaterThan:', 'func load(_ url: URL, using session: NativeSession, tripStore: NativeTripStore, active: Bool, expiresNoLaterThan:'),
('        guard clearCopy() else { return }\n        busy = true;', '        guard clearCopy() else { return }\n        guard let context = NativeJourneyMaterialOutcomeBridge.context(store: tripStore, session: session, active: active),\n              context.eligible, context.actor == source.actor, context.tripID == source.detail.trip.id,\n              context.tripVersion == source.detail.trip.headVersion else { message = "scope"; return }\n        _ = tripStore.materialOutcome.select(context: context, medium: .pdf)\n        busy = true;'),
('            try session.rememberPDFIntake(value, actor: source.actor)\n', '            if let selected = tripStore.materialOutcome.selection,\n               let context = NativeJourneyMaterialOutcomeBridge.context(store: tripStore, session: session, active: tripStore.materialActive) {\n                _ = tripStore.materialOutcome.bindPDF(value, selection: selected, context: context)\n            }\n            try session.rememberPDFIntake(value, actor: source.actor)\n'),
('        message = "reviewRequired"\n', '        if let selected = tripStore.materialOutcome.selection, let pending = tripStore.pending,\n           let context = NativeJourneyMaterialOutcomeBridge.context(store: tripStore, session: session, active: tripStore.materialActive) {\n            _ = tripStore.materialOutcome.proposalReady(pending, selection: selected, context: context)\n        }\n        message = "reviewRequired"\n'),
('                let journalObserver = session.journalDataObservation(.pdf), journalTicket = journalObserver.begin()\n                try session.completePDFIntake(value, actor: source.actor); journal = nil; message = "confirmed"', '                _ = await NativeJourneyMaterialOutcomeBridge.confirmed(outcome: tripStore.materialOutcome, store: tripStore,\n                    session: session, active: { tripStore.materialActive })\n                let journalObserver = session.journalDataObservation(.pdf), journalTicket = journalObserver.begin()\n                try session.completePDFIntake(value, actor: source.actor); journal = nil; message = "confirmed"')]))
pins.append(change(b+'PDFIntake/NativePDFIntakeView.swift',[
('    @Environment(\\.dismiss) private var dismiss', '    @Environment(\\.scenePhase) private var phase\n    @Environment(\\.dismiss) private var dismiss'),
('await model.load(url, using: session) }', 'await model.load(url, using: session, tripStore: tripStore, active: phase == .active) }'),
('await model.load(url, using: session, expiresNoLaterThan: expiry)', 'await model.load(url, using: session, tripStore: tripStore, active: phase == .active, expiresNoLaterThan: expiry)'),
('            .onChange(of: session.dataScope) { _, value in', '            .onChange(of: phase) { _, phase in\n                tripStore.materialActive = phase == .active\n                if phase != .active { tripStore.materialOutcome.exit(.scopeChanged) }\n            }\n            .onChange(of: session.dataScope) { _, value in\n                tripStore.materialOutcome.exit(.scopeChanged)'),
('                model.start(using: session)', '                tripStore.materialActive = phase == .active\n                model.start(using: session)'),
('if model.clearCopy() { dismiss() } }.disabled(model.busy)', 'if model.clearCopy() { tripStore.materialOutcome.exit(.cancelled); dismiss() } }.disabled(model.busy)')]))
pins.append(change(b+'Trip/NativeTripView.swift',[
('                        confirmed(detail)', '                        confirmed(detail)\n                            .task(id: store.materialOutcome.confirmed?.source.confirmationEventID) {\n                                guard let value = store.materialOutcome.confirmed,\n                                      let context = NativeJourneyMaterialOutcomeBridge.context(store: store, session: session, active: scenePhase == .active),\n                                      store.materialOutcome.presented(value, context: context) != nil else { return }\n                                _ = NativeJourneyMaterialOutcomeConsumer().measurementQualification(for: .confirmedReadback(value))\n                            }'),
('        .onChange(of: session.retainedDataScope) { _, retained in', '        .task(id: scenePhase) {\n            store.materialActive = scenePhase == .active\n            store.materialOutcome.invalidate(context: NativeJourneyMaterialOutcomeBridge.context(store: store, session: session, active: store.materialActive))\n        }\n        .onChange(of: store.detail?.trip.headVersion) { _, _ in\n            store.materialOutcome.invalidate(context: NativeJourneyMaterialOutcomeBridge.context(store: store, session: session, active: store.materialActive))\n        }\n        .onChange(of: session.retainedDataScope) { _, retained in')]))
pins.append(change(b+'Trip/NativeScreenshotReviewView.swift',[
('    @Environment(\\.dismiss) private var dismiss', '    @Environment(\\.scenePhase) private var phase\n    @Environment(\\.dismiss) private var dismiss'),
('                status = .loading\n                loadTask = Task', '                if let store, let session {\n                    guard let context = NativeJourneyMaterialOutcomeBridge.context(store: store, session: session, active: phase == .active),\n                          context.eligible, context.tripID == source.tripID, context.tripVersion == source.tripVersion else { status = .unavailable; return }\n                    _ = store.materialOutcome.select(context: context, medium: .screenshot)\n                    _ = NativeJourneyMaterialOutcomeConsumer().measurementQualification(for: .continuation(.screenshotLineageUnavailable))\n                }\n                status = .loading\n                loadTask = Task'),
('            .onChange(of: selectedItem) { _, item in', '            .onChange(of: phase) { _, phase in\n                if phase != .active { store?.materialOutcome.exit(.scopeChanged) }\n            }\n            .onChange(of: selectedItem) { _, item in'),
('        loadTask?.cancel(); recognitionTask?.cancel(); loadTask = nil; recognitionTask = nil', '        store?.materialOutcome.exit(.cancelled)\n        loadTask?.cancel(); recognitionTask?.cancel(); loadTask = nil; recognitionTask = nil')]))
# Existing project is explicit-file, so inclusion remains a shared PBX candidate.
p='ios/VisePanda/VisePanda.xcodeproj/project.pbxproj'
s=(root/p).read_text();after=s
for i,name in enumerate(['NativeJourneyMaterialOutcome.swift','NativeJourneyMaterialOutcomeBridge.swift'],1):
    ref=f'FE220000000000000000000{i}';build=f'FE221000000000000000000{i}'
    if ref in after or build in after: raise ValueError('PBX identity exists')
    after=after.replace('/* End PBXBuildFile section */', f'\t\t{build} = {{isa = PBXBuildFile; fileRef = {ref}; }};\n/* End PBXBuildFile section */')
    after=after.replace('/* End PBXFileReference section */', f'\t\t{ref} = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = VisePanda/Features/JourneyMaterialOutcome/{name}; sourceTree = SOURCE_ROOT; }};\n/* End PBXFileReference section */')
    marker='/* Begin PBXSourcesBuildPhase section */';offset=after.index(marker);files=after.index('files = (',offset)+len('files = (')
    after=after[:files]+f'\n\t\t\t\t{build},'+after[files:]
pins.append(change(p,[(s,after)]))
(out/'pins.json').write_text(json.dumps({'baseHead':'daa7bae44a660381fb3295d0d2afc327ea98d3ba','applied':False,'pins':pins},indent=2)+'\n')
print(f'{len(pins)} full before/patch/after shared candidates, NOT APPLIED')
