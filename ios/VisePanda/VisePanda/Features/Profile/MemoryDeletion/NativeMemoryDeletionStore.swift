import Foundation
import Observation

@MainActor @Observable final class NativeMemoryDeletionStore {
    private(set) var scope:NativeDataScope?
    private(set) var profiles:[NativeMemoryProfile]=[]
    private(set) var selected:Set<String>=[]
    private(set) var plan:NativeMemoryDeletePlan?
    private(set) var command:NativeMemoryDeleteCommand?
    private(set) var body:Data?
    private(set) var receipt:NativeMemoryDeleteReceipt?
    private(set) var busy=false
    private(set) var notice:String?
    private var generation=UUID()
    private var profilesDeadline:TimeInterval=0
    private var planDeadline:TimeInterval=0
    func bind(_ next:NativeDataScope?) {
        guard scope != next else{return}
        generation=UUID();scope=next;profiles=[];selected=[];plan=nil;command=nil;body=nil;receipt=nil;busy=false;notice=nil;profilesDeadline=0;planDeadline=0
    }
    func visibleProfiles(_ current:NativeDataScope?)->[NativeMemoryProfile]{current != nil && current==scope && ProcessInfo.processInfo.systemUptime<profilesDeadline ? profiles:[]}
    func visiblePlan(_ current:NativeDataScope?)->NativeMemoryDeletePlan? {
        guard current != nil,current==scope,let plan,ProcessInfo.processInfo.systemUptime<planDeadline,NativeCoreDate.utc(plan.expiresAt).map({$0>Date()})==true else{return nil};return plan
    }
    func select(_ id:String,chosen:Bool,current:NativeDataScope?) {
        guard !busy,command==nil,visibleProfiles(current).contains(where:{$0.id==id && !["deleted","rejected"].contains($0.state)}) else{return}
        if chosen{if selected.count<100{selected.insert(id)}}else{selected.remove(id)}
        plan=nil;receipt=nil;planDeadline=0
    }
    func load(current:()->NativeDataScope?,get:()async throws->Data)async {
        guard !busy,let scope,current()==scope else{return}
        let own=generation,started=ProcessInfo.processInfo.systemUptime;busy=true;plan=nil;planDeadline=0
        defer{if generation==own{busy=false}}
        do {
            let bytes=try await get();guard generation==own,current()==scope,!Task.isCancelled else{return}
            profiles=try NativeMemoryWire.read(bytes,owner:scope.subject);profilesDeadline=started+30
            if let receipt{profiles.removeAll{row in receipt.selection.memories.contains{$0.memoryId==row.id}}}
            if command==nil{selected=[]};notice=nil
        }catch{if generation==own,current()==scope{profiles=[];profilesDeadline=0;failed(error)}}
    }
    func preview(current:()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard !busy,command==nil,let scope,current()==scope,(1...100).contains(selected.count) else{return}
        let rows=visibleProfiles(scope).filter{selected.contains($0.id)}
        guard rows.count==selected.count else{notice="staleProfiles";return}
        let own=generation,started=ProcessInfo.processInfo.systemUptime;busy=true;plan=nil;receipt=nil;planDeadline=0
        defer{if generation==own{busy=false}}
        do {
            let bytes=try await post(JSONSerialization.data(withJSONObject:["action":"preview","memoryIds":rows.map(\.id).sorted()]))
            guard generation==own,current()==scope,!Task.isCancelled else{return}
            let value=try NativeMemoryDeletePlan.decode(bytes,selected:rows)
            guard ProcessInfo.processInfo.systemUptime-started<300,let expiry=NativeCoreDate.utc(value.expiresAt) else{throw NativeDataError.invalidResponse}
            plan=value;planDeadline=started+min(300,expiry.timeIntervalSinceNow);notice=nil
        }catch{if generation==own,current()==scope{failed(error)}}
    }
    func restore(_ journal:NativeMemoryDeleteJournal,current:NativeDataScope?) throws {
        guard let current,journal.matches(current),scope==current else{throw NativeDataError.staleSessionResponse}
        command=try journal.command();body=journal.body;plan=nil;receipt=nil;selected=[];profiles=[];notice="unconfirmed"
    }
    func confirm(reviewedIdentity:String,exportsReviewed:Bool,current:()->NativeDataScope?,persist:(NativeMemoryDeleteCommand,Data)throws->Void,post:(Data)async throws->Data)async {
        guard !busy,command==nil,let scope,current()==scope,let plan=visiblePlan(scope),plan.reviewIdentity==reviewedIdentity,plan.conflicts.isEmpty,exportsReviewed else{return}
        let value=NativeMemoryDeleteCommand(plan)
        do {let bytes=try JSONEncoder().encode(value);try persist(value,bytes);command=value;body=bytes}
        catch{failed(error);return}
        await retry(current:current,post:post)
    }
    func retry(current:()->NativeDataScope?,post:(Data)async throws->Data)async {
        guard !busy,let scope,current()==scope,let command,let body else{return}
        let own=generation;busy=true;defer{if generation==own{busy=false}}
        do {
            let bytes=try await post(body);guard generation==own,current()==scope,!Task.isCancelled else{return}
            let next=try NativeMemoryDeleteReceipt.decode(bytes,command:command)
            guard receipt?.state != "completed" || next.state=="completed" else{throw NativeDataError.invalidResponse}
            receipt=next;profiles.removeAll{row in command.selection.memories.contains{$0.memoryId==row.id}};notice=nil
        }catch{if generation==own,current()==scope{failed(error)}}
    }
    func read(current:()->NativeDataScope?,get:(String)async throws->Data)async {
        guard !busy,let scope,current()==scope,let command else{return}
        let own=generation;busy=true;defer{if generation==own{busy=false}}
        do {
            let bytes=try await get(command.requestId);guard generation==own,current()==scope,!Task.isCancelled else{return}
            let next=try NativeMemoryDeleteReceipt.decode(bytes,command:command)
            guard receipt?.state != "completed" || next.state=="completed" else{throw NativeDataError.invalidResponse}
            receipt=next;profiles.removeAll{row in command.selection.memories.contains{$0.memoryId==row.id}};notice=nil
        }catch{if generation==own,current()==scope{failed(error)}}
    }
    func newSelectionAfterCompletion() {
        guard !busy,receipt?.state=="completed" else{return}
        command=nil;body=nil;plan=nil;receipt=nil;selected=[];notice=nil
    }
    private func failed(_ error:Error) {
        if case NativeDataError.server(let code)=error {notice=code=="REAUTHENTICATION_REQUIRED" ? "reauth":"unconfirmed"}
        else{notice="unconfirmed"}
    }
}
