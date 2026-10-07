from pathlib import Path
import hashlib, difflib, json
root=Path(__file__).resolve().parents[7]
# /repo/ios/VisePanda/VisePanda/Features/JournalData/Candidates/prepare.py
root=next(p for p in Path(__file__).resolve().parents if (p/'AGENTS.md').is_file())
base=Path('ios/VisePanda/VisePanda')
out=Path(__file__).parent
staged=Path('/tmp/vpj58-journal-candidate-stage');staged.mkdir(exist_ok=True)
pins={}
def write(path,after):
 before=(root/path).read_text(); assert before!=after, path
 patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+str(path),tofile='b/'+str(path)))
 (out/(path.name+'.patch')).write_text(patch)
 target=staged/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(after)
 pins[str(path)]={'before':hashlib.sha256(before.encode()).hexdigest(),'after':hashlib.sha256(after.encode()).hexdigest(),'patch':hashlib.sha256(patch.encode()).hexdigest()}
def replace(text,before,after,count=1):
 assert text.count(before)==count,(before,text.count(before),count)
 return text.replace(before,after)
# No Journal ABI changes. Observe only the already-decoded terminal branch of each original Store.
for folder,name,source,receipt in [
 ('ResultData','NativeResultDataStore','result','result.binding.requestID'),
 ('ProfileData','NativeProfileDataStore','profile','result.binding.requestID'),
 ('TurnData','NativeTurnDataStore','turn','result.binding.requestID'),
 ('ConversationData','NativeConversationDataStore','conversation','result.binding.requestID'),
 ('CoverageProgressData','NativeCoverageProgressStore','coverageProgress','result.binding.requestID'),
 ('NotificationData','NativeNotificationDataStore','notificationData','receipt.binding.requestID'),
 ('MaterialReferenceData','NativeMaterialReferenceStore','materialReference','receipt.binding.requestID')]:
 path=base/'Features'/folder/(name+'.swift');text=(root/path).read_text()
 pos=text.index('{',text.index('final class'))+1
 text=text[:pos]+'\n    var journalObservation: NativeJournalDataObservation?\n'+text[pos:]
 before='try journal.complete(pending, actor: actor)'
 assert text.count(before)==1
 text=text.replace(before,'let journalTicket = journalObservation?.begin()\n            '+before+'\n            journalObservation?.finish(journalTicket, '+receipt+')')
 write(path,text)
path=base/'Features/ArchiveData/NativeArchiveDataStore.swift';text=(root/path).read_text();pos=text.index('{',text.index('final class'))+1
text=text[:pos]+'\n    var journalObservation: NativeJournalDataObservation?\n'+text[pos:]
text=replace(text,'try journal.complete(pending, actor: actor); self.pending = nil\n                receipt = result;', 'let journalTicket = journalObservation?.begin()\n                try journal.complete(pending, actor: actor); self.pending = nil\n                journalObservation?.finish(journalTicket, result.binding.requestID)\n                receipt = result;')
# Export completion verifies original signed binding and exact encrypted file, not a deletion receipt.
text=replace(text,'try journal.complete(pending, actor: actor); self.pending = nil\n                preview = nil;', 'let journalTicket = journalObservation?.begin()\n                try journal.complete(pending, actor: actor); self.pending = nil\n                journalObservation?.finish(journalTicket, binding.requestID)\n                preview = nil;')
write(path,text)
def observe_store(folder,name,changes):
 path=base/'Features'/folder/(name+'.swift');text=(root/path).read_text();pos=text.index('{',text.index('final class'))+1
 text=text[:pos]+'\n    var journalObservation: NativeJournalDataObservation?\n'+text[pos:]
 for before,after,count in changes:text=replace(text,before,after,count)
 write(path,text)
# These are exact successful decoder branches. Explicit local discard/UNKNOWN branches stay untouched.
observe_store('CommunitySafety','NativeCommunitySafetyStore',[(
 'do { try complete(value) } catch',
 'let journalTicket = journalObservation?.begin()\n        do { try complete(value) } catch',1),(
 '        pending = nil\n        if case .operation',
 '        pending = nil\n        journalObservation?.finish(journalTicket, try NativeCommunitySafetyCommand(body: value.body).operationID)\n        if case .operation',1)])
observe_store('CommunitySubmission','NativeCommunityStore',[(
 'do { try complete(durable) } catch { journalReady = false; storageReady = false; throw error }; pending = nil; apply(outcome, command: command)',
 'let journalTicket = journalObservation?.begin()\n            do { try complete(durable) } catch { journalReady = false; storageReady = false; throw error }; pending = nil; apply(outcome, command: command)\n            journalObservation?.finish(journalTicket, command.operationID)',1),(
 'do { try complete(pending) } catch { journalReady = false; storageReady = false; throw error }; self.pending = nil; apply(outcome, command: command)',
 'let journalTicket = journalObservation?.begin()\n                do { try complete(pending) } catch { journalReady = false; storageReady = false; throw error }; self.pending = nil; apply(outcome, command: command)\n                journalObservation?.finish(journalTicket, command.operationID)',2)])
observe_store('CommunityExperience','NativeExperienceStore',[(
 '            do { try complete(pending); self.pending = nil }',
 '            let journalTicket = journalObservation?.begin()\n            do { try complete(pending); self.pending = nil }',1),(
 '            // Receipts are acknowledgements.',
 '            journalObservation?.finish(journalTicket, try NativeExperienceCommand(body: pending.body).operationID)\n            // Receipts are acknowledgements.',1)])
observe_store('ServiceOperations','NativeServiceOperationStore',[(
 '            try complete(original); pending = nil; receipt = result; notice = nil\n            cases = []; capacity = nil; deadline = 0',
 '            let journalTicket = journalObservation?.begin()\n            try complete(original); pending = nil; receipt = result; notice = nil\n            cases = []; capacity = nil; deadline = 0\n            journalObservation?.finish(journalTicket, try frozen.operationId)',1)])
observe_store('TravelerBrief','NativeTravelerBriefStore',[(
 '            try complete(original); pending = nil; receipt = result; notice = nil; erased = false',
 '            let journalTicket = journalObservation?.begin()\n            try complete(original); pending = nil; receipt = result; notice = nil; erased = false\n            journalObservation?.finish(journalTicket, frozen.operationID)',1)])
observe_store('Reservations','NativeReservationStore',[(
 '        try journal.complete(pending, scope: actor)\n        self.pending = nil; recoveryChecked = true; items = [receipt]; pageLoaded = false',
 '        let journalTicket = journalObservation?.begin()\n        try journal.complete(pending, scope: actor)\n        self.pending = nil; recoveryChecked = true; items = [receipt]; pageLoaded = false\n        journalObservation?.finish(journalTicket, command.operationId)',1),(
 '                try self.journal.complete(saved, scope: actor)\n                self.pending = nil; self.items = [result.current]; self.pageLoaded = false; self.invalidatePreview()',
 '                let journalTicket = self.journalObservation?.begin()\n                try self.journal.complete(saved, scope: actor)\n                self.pending = nil; self.items = [result.current]; self.pageLoaded = false; self.invalidatePreview()\n                self.journalObservation?.finish(journalTicket, command.operationId)',1)])
observe_store('Recovery','NativeRecoveryStore',[(
 '        try journal.remove(pending, scope: current); self.pending = nil; self.outcome = nil; readAttempted = false\n        clearPreview(); notice = nil',
 '        let journalTicket = journalObservation?.begin()\n        try journal.remove(pending, scope: current); self.pending = nil; self.outcome = nil; readAttempted = false\n        clearPreview(); notice = nil\n        journalObservation?.finish(journalTicket, pending.operationID)',1)])
observe_store('TripLifecycle','NativeTripLifecycleStore',[(
 '            try client.complete(journal, actor)\n            let outcome: String',
 '            let journalTicket = journalObservation?.begin()\n            try client.complete(journal, actor)\n            let outcome: String',1),(
 '            busy = false\n            await load(client)',
 '            journalObservation?.finish(journalTicket, command.operationID)\n            busy = false\n            await load(client)',1)])
observe_store('PlaceActions','NativePlaceActionStore',[(
 '                try complete(value); pending = nil; receipt = nil; self.cancelled = cancelled; receiptAbsent = false',
 '                let journalTicket = journalObservation?.begin()\n                try complete(value); pending = nil; receipt = nil; self.cancelled = cancelled; receiptAbsent = false\n                journalObservation?.finish(journalTicket, try value.command.operationId)',1),(
 '            try complete(value); pending = nil; receipt = result; cancelled = nil; if result.action == "unsave" { rememberedSaved = nil }; context = nil; deadline = 0',
 '            let journalTicket = journalObservation?.begin()\n            try complete(value); pending = nil; receipt = result; cancelled = nil; if result.action == "unsave" { rememberedSaved = nil }; context = nil; deadline = 0\n            journalObservation?.finish(journalTicket, try value.command.operationId)',1)])
# Notifications are deliberately metadata-only; the existing view retains its explicit replay/permission gates.
observe_store('Notifications','NativeNoticeStore',[(
 '            try complete(original, receipt); pending = nil',
 '            let journalTicket = journalObservation?.begin()\n            try complete(original, receipt); pending = nil\n            journalObservation?.finish(journalTicket, original.command.operationId)',1)])
for folder,name,source,marker in [
 ('CommunitySafety','NativeCommunitySafetyView','communitySafety','    private func reload() async {'),
 ('CommunitySubmission','NativeCommunitySubmissionView','community','    private func reload() async {'),
 ('CommunityExperience','NativeExperienceView','experience','    private func reload(_ actor: NativeCommunitySafetyActor) async {'),
 ('ServiceOperations','NativeServiceOperationsView','serviceOperation','    private func load(actor: NativeDataScope, captured: Key) async {'),
 ('TravelerBrief','NativeTravelerBriefView','travelerBrief','    private func load(_ actor: NativeDataScope) async {'),
 ('Reservations','NativeReservationsView','reservation','        .task(id: actor) {'),
 ('Recovery','NativeRecoveryView','recovery','    private func refresh() async {'),
 ('TripLifecycle','NativeTripLifecycleView','tripLifecycle','        .task(id: session.dataScope) {'),
 ('PlaceActions','NativePlaceActionsView','placeAction','        .task(id: key) { await loadTrips() }'),
 ('Trip','NativeTravelRemindersView','notification','    @MainActor private func refresh() async {')]:
 path=base/'Features'/folder/(name+'.swift');text=(root/path).read_text()
 nativeSession='settings.nativeSession' if source=='experience' else 'session'
 if source=='placeAction':text=replace(text,marker,'        .task(id: key) { store.journalObservation = session.journalDataObservation(.placeAction); await loadTrips() }')
 else:text=replace(text,marker,marker+'\n        store.journalObservation = '+nativeSession+'.journalDataObservation(.'+source+')')
 write(path,text)
# Stores already receive Session: no extra callback API or wrapper executor.
path=base/'Features/PDFIntake/NativePDFIntakeStore.swift';text=(root/path).read_text()
for marker in [
 '                try session.completePDFIntake(value, actor: source.actor); journal = nil; message = "confirmed"',
 '            try session.completePDFIntake(value, actor: source.actor); journal = nil\n']:
 spaces=marker[:len(marker)-len(marker.lstrip())]
 text=replace(text,marker,spaces+'let journalObserver = session.journalDataObservation(.pdf), journalTicket = journalObserver.begin()\n'+marker.rstrip('\n')+'\n'+spaces+'journalObserver.finish(journalTicket, value.command.operationId)'+('\n' if marker.endswith('\n') else ''))
write(path,text)
path=base/'Features/ScopedTripEdit/NativeScopedTripEditStore.swift';text=(root/path).read_text()
# Only the four strict original receipt decoders; an outcome envelope with no receipt stays UNKNOWN locally.
for marker in [
 '            let declined = try NativeScopedTripDeclined.decode(raw, journal: saved)',
 '            let ready = try NativeScopedTripCandidates.decode(bytes, journal: saved, context: context)',
 '            let candidate = try NativeScopedTripProposalReceipt.decode(bytes, journal: saved, context: context)']:
 text=replace(text,marker,marker+'\n            let journalObserver = session.journalDataObservation(.scopedTrip), journalTicket = journalObserver.begin()')
for marker in [
 '            notice = "declined:" + declined.reason',
 '            } else { candidates = nil; candidatesJournal = nil; notice = "refreshRequired" }',
 '            else { receipt = nil; notice = "refreshRequired" }']:
 text=replace(text,marker,marker+'\n            journalObserver.finish(journalTicket, command.operationID)')
marker='            try session.completeScopedTripEdit(saved, actor: actor); journal = nil; context = nil; receipt = nil; notice = "lockSaved"'
text=replace(text,marker,'            let journalObserver = session.journalDataObservation(.scopedTrip), journalTicket = journalObserver.begin()\n'+marker+'\n            journalObserver.finish(journalTicket, command.operationID)')
write(path,text)
path=base/'Features/Ask/NativeAskStore.swift';text=(root/path).read_text()
marker='''                guard pending.matches(recovered) else { throw NativeDataError.invalidResponse }
                try session.clearPendingAsk(matching: pending)
                self.pending = nil; pendingNotice = nil; pendingAcknowledged = false; draft = ""
                intent = mode.usesTask ? .awaiting(recovered.id) : .newGoal'''
text=replace(text,marker,marker.replace('                try session.clearPendingAsk','                let journalObserver = session.journalDataObservation(.ask), journalTicket = journalObserver.begin()\n                try session.clearPendingAsk')+'\n                journalObserver.finish(journalTicket, pending.idempotencyKey)')
write(path,text)
# Coverage itself: only original terminal verifier + original module completion, not stop/UNKNOWN.
path=base/'Features/DataCoverage/NativeDataCoverageStore.swift';text=(root/path).read_text()
text=replace(text,'    let completeOriginal:', '    var journalObservation: NativeJournalDataObservation?\n    let completeOriginal:')
text=replace(text,'        complete = { try session.completeDataCoverage($0, actor: $1) }','        complete = { try session.completeDataCoverage($0, actor: $1) }\n        journalObservation = session.journalDataObservation(.coverage)')
text=replace(text,'                try client.completeOriginal(original, reply, actor)\n                try client.complete(pending, actor); self.pending = nil',
 '                let journalTicket = client.journalObservation?.begin()\n                try client.completeOriginal(original, reply, actor)\n                try client.complete(pending, actor); self.pending = nil\n                client.journalObservation?.finish(journalTicket, command.operationID)')
write(path,text)

path=base/'App/NativeSession.swift';text=(root/path).read_text()
text=replace(text,'    private let keychainService = "com.visepanda.native.local-session.v2"\n','    private let keychainService = "com.visepanda.native.local-session.v2"\n'+(out/'session-additions.swift.fragment').read_text())
for method,source,constructor in [
 ('turnDataStore','turn','NativeTurnDataStore(scope: scope, vault: vault)'),
 ('resultDataStore','result','NativeResultDataStore(scope: scope, vault: vault)'),
 ('profileDataStore','profile','NativeProfileDataStore(scope: scope, vault: vault)'),
 ('conversationDataStore','conversation','NativeConversationDataStore(scope: scope, vault: vault)'),
 ('archiveDataStore','archive','NativeArchiveDataStore(scope: scope, vault: vault)'),
 ('coverageProgressStore','coverageProgress','NativeCoverageProgressStore(vault: vault)'),
 ('notificationDataStore','notificationData','NativeNotificationDataStore(scope: scope, vault: vault)'),
 ('materialReferenceStore','materialReference','NativeMaterialReferenceStore(scope: scope, vault: vault)')]:
 text=replace(text,'        '+constructor+'\n','        let store = '+constructor+'\n        store.journalObservation = journalDataObservation(.'+source+'); return store\n')
# Only own files/evidence; preserve every original pending and logout branch.
for marker in ['        do { try NativeGuideCacheDataStore.eraseExports() }']:
 assert text.count(marker)==2
 parts=text.split(marker); fixed=parts[0]
 for suffix in parts[1:]:
  original_catch=suffix.split('\n',2)[1]
  return_clause='return false' if 'return false' in original_catch else 'return'
  fixed+='        journalDataEvidence.bind(nil)\n        do { try NativeJournalDataStore.eraseExports() }\n        catch { failureCode="journalDataFileCleanupRequired"; status="storageError"; '+return_clause+' }\n'+marker+suffix
 text=fixed
# Extract accepted pure Guide validation; inspection never invokes the expiry writer.
old = '    func pendingPlaceGuide(actor: NativeDataScope) throws -> NativePlaceGuidePending? {\n        guard dataScope == actor else { throw NativeDataError.sessionUnavailable }\n        let (status, bytes) = vault.read(service: placeGuideJournalService, owner: actor.subject)\n        if status == errSecItemNotFound { return nil }\n        guard status == errSecSuccess, let bytes, bytes.count <= 32_000 else { throw NativeDataError.sessionUnavailable }\n        let pending = try JSONDecoder().decode(NativePlaceGuidePending.self, from: bytes)\n        _ = try pending.selection(for: actor); try pending.validatedRecovery()\n'
new = old.replace('func pendingPlaceGuide(', 'private func storedPlaceGuideRecovery(') + '        return pending\n    }\n    func pendingPlaceGuide(actor: NativeDataScope) throws -> NativePlaceGuidePending? {\n        guard let pending = try storedPlaceGuideRecovery(actor: actor) else { return nil }\n'
text=replace(text,old,new)
write(path,text)
path=base/'Features/DataCoverage/NativeDataCoverageModuleView.swift';text=(root/path).read_text()
text=replace(text,'            } else if module.id == "guide_cache" {','            } else if module.id == "local_journals" {\n                NativeJournalDataView(coverage: store, session: session, chinese: chinese)\n            } else if module.id == "guide_cache" {')
write(path,text)
# Guide's original policy-scoped history is observed only when it also proves the exact original question,
# current notice and live qualified source. Fenced/expired/withdrawn/missing identity stays UNKNOWN locally.
path=base/'Features/PlaceGuide/NativePlaceGuideFollowUpStore.swift';text=(root/path).read_text()
marker='''            // Original history proves acceptance, including a lost Guide HTTP acknowledgement.
            if let pending { try session.completePlaceGuide(pending, actor: selection.scope); submitted = selected; self.pending = nil }
            if !found.waiting { guide.clearUnlicensedProgress() }'''
replacement='''            // Original history proves acceptance, including a lost Guide HTTP acknowledgement.
            let journalObserver = session.journalDataObservation(.guide)
            let exactOriginalQuestion = pending?.fencedReference == nil && pending != nil
                && (try? pending?.fields()["question"] as? String) == found.input
            let journalTicket = exactOriginalQuestion && reply.policy.consentState == .accepted
                && reply.policy.id == selected.policyID && reply.policy.noticeHash == selected.noticeHash
                && guide.visible(session.dataScope)?.digest == selected.digest ? journalObserver.begin() : nil
            if let pending { try session.completePlaceGuide(pending, actor: selection.scope); submitted = selected; self.pending = nil }
            if !found.waiting { guide.clearUnlicensedProgress() }
            journalObserver.finish(journalTicket, selected.operationID)'''
text=replace(text,marker,replacement);write(path,text)
# Already-typed original Session companions: no new server dispatch or modified request/complete ABI.
path=base/'App/NativeSession.swift';text=(staged/path).read_text()
for source,method,start,end,receipt in [
 ('memoryDelete','completeMemoryDeletion','        let status=vault.remove(service:memoryDeleteVaultService,owner:scope.subject)',
  '        guard status==errSecSuccess || status==errSecItemNotFound else{throw NativeDataError.sessionUnavailable}', 'receipt.requestId'),
 ('linkedTripDelete','completeLinkedTripDeletion','        let result=vault.remove(service:linkedDeleteVaultService,owner:target.scope.subject)',
  '        guard result==errSecSuccess || result==errSecItemNotFound else{throw NativeDataError.sessionUnavailable}', 'receipt.requestId')]:
 i=text.index('    func '+method+'(');j=text.index('\n    }',i);chunk=text[i:j]
 chunk=replace(chunk,start,'        let journalObserver = journalDataObservation(.'+source+'), journalTicket = journalObserver.begin()\n'+start)
 chunk=replace(chunk,end,end+'\n        journalObserver.finish(journalTicket, '+receipt+')')
 text=text[:i]+chunk+text[j:]
# The material execute method already performs original local physical deletion and keeps its immutable receipt.
i=text.index('    func executeDeviceMaterialDeletion(');j=text.index('\n    }',i);chunk=text[i:j]
chunk=replace(chunk,'        let pending=try pendingDeviceMaterialDeletion()', '        let pending=try pendingDeviceMaterialDeletion()\n        let journalObserver = journalDataObservation(.deviceDelete), journalTicket = journalObserver.begin()')
chunk=replace(chunk,'            return receipt // Replay proves', '            journalObserver.finish(journalTicket, receipt.requestId)\n            return receipt // Replay proves')
chunk=replace(chunk,'        try removeDeviceMaterialDeleteRequest(owner:actor.subject)\n        return receipt','        try removeDeviceMaterialDeleteRequest(owner:actor.subject)\n        journalObserver.finish(journalTicket, receipt.requestId)\n        return receipt')
text=text[:i]+chunk+text[j:]
write(path,text)
# Support receipt validation stays in its original consumers and synchronous projections.
path=base/'Features/Trip/NativeTripStore.swift';text=(root/path).read_text()
marker='''            try session.completeTripSupportConfirmation(journal,receipt:result,actor:actor)
            try support.confirmed(key:request.idempotencyKey,choices:choices)
            self.pending=nil;self.draft=nil'''
text=replace(text,marker,marker.replace('            try session.completeTripSupportConfirmation','            let journalObserver = session.journalDataObservation(.tripSupport), journalTicket = journalObserver.begin()\n            try session.completeTripSupportConfirmation')+'\n            journalObserver.finish(journalTicket, request.idempotencyKey)')
write(path,text)
path=base/'Features/Trip/Support/NativeTripSupportView.swift';text=(root/path).read_text()
marker='''            try session.completeTripSupportConfirmation(journal,receipt:result,actor:actor)
            receipt=result;self.journal=nil;request=nil'''
text=replace(text,marker,marker.replace('            try session.completeTripSupportConfirmation','            let journalObserver = session.journalDataObservation(.tripSupport), journalTicket = journalObserver.begin()\n            try session.completeTripSupportConfirmation')+'\n            journalObserver.finish(journalTicket, try journal.request().idempotencyKey)',2)
write(path,text)
# Wrapper deletion can also complete one of the original module journals. Its original verifier already ran.
path=base/'Features/DataCoverage/NativeDataCoverageOriginal.swift';text=(root/path).read_text()
marker='''        guard original.matches(actor), let bytes = reply.result else { throw NativeDataError.staleSessionResponse }
        switch original.moduleID {'''
replacement='''        guard original.matches(actor), let bytes = reply.result else { throw NativeDataError.staleSessionResponse }
        let observedSources: [String: NativeJournalDataSourceID] = ["ugc": .community, "safety": .communitySafety,
            "publication": .experience, "case": .serviceOperation, "brief": .travelerBrief]
        let journalObserver = observedSources[original.moduleID].map { session.journalDataObservation($0) }
        let journalTicket = journalObserver?.begin()
        switch original.moduleID {'''
text=replace(text,marker,replacement)
# Last switch ends the original complete function. Early absence/throws do not reach this observation.
marker='''        case "guide": break
        default: throw NativeDataError.invalidResponse
        }
    }
}'''
text=replace(text,marker,marker.replace('        }\n    }','        }\n        journalObserver?.finish(journalTicket, original.operationID)\n    }'))
write(path,text)

# Pure PBX registration: five existing own product files + one existing own test, 13 new objects.
path=Path('ios/VisePanda/VisePanda.xcodeproj/project.pbxproj');text=(root/path).read_text()
names=[p.name for p in sorted((root/base/'Features/JournalData').glob('*.swift'))]+['NativeJournalDataTests.swift']
assert len(names)==6 and (root/'ios/VisePanda/VisePandaTests/NativeJournalDataTests.swift').exists()
refs={name:hashlib.sha256(('JournalData/ref/'+name).encode()).hexdigest()[:24].upper() for name in names}
builds={name:hashlib.sha256(('JournalData/build/'+name).encode()).hexdigest()[:24].upper() for name in names}
group=hashlib.sha256(b'JournalData/group').hexdigest()[:24].upper()
assert all(value not in text for value in list(refs.values())+list(builds.values())+[group])
new_builds=''.join('\t\t'+builds[n]+' /* '+n+' in Sources */ = {isa = PBXBuildFile; fileRef = '+refs[n]+' /* '+n+' */; };\n' for n in names)
new_refs=''.join('\t\t'+refs[n]+' /* '+n+' */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = '+('VisePandaTests/' if n.endswith('Tests.swift') else 'VisePanda/Features/JournalData/')+n+'; sourceTree = SOURCE_ROOT; };\n' for n in names)
text=replace(text,'/* End PBXBuildFile section */',new_builds+'/* End PBXBuildFile section */')
text=replace(text,'/* End PBXFileReference section */',new_refs+'/* End PBXFileReference section */')
text=replace(text,'\t\t\t\t541C4A7662005C1FCE8B757B /* GuideCacheData */,','\t\t\t\t'+group+' /* JournalData */,\n\t\t\t\t541C4A7662005C1FCE8B757B /* GuideCacheData */,')
text=replace(text,'/* End PBXGroup section */','\t\t'+group+' /* JournalData */ = {isa = PBXGroup; children = ('+', '.join(refs.values())+'); name = JournalData; sourceTree = "<group>"; };\n/* End PBXGroup section */')
marker='\t\t800000000000000000000001 /* Sources */ = {\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = ('
text=replace(text,marker,marker+'\n'+''.join('\t\t\t\t'+builds[n]+' /* '+n+' in Sources */,\n' for n in names[:-1]))
marker='\t\t800000000000000000000003 /* Sources */ = {isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; files = ('
text=replace(text,marker,marker+builds[names[-1]]+' /* NativeJournalDataTests.swift in Sources */,\n')
write(path,text)

(out/'pins.json').write_text(json.dumps(pins,indent=2)+'\n')
print('Prepared',len(pins),'precise shared candidates; shared sources untouched.')
