import Foundation
import Observation

/// Native selection identity only. Server preview/receipt decoding will supply
/// the fixed wire; this gate does not mint scope, digest or deletion authority.
struct NativeLinkedTripDeleteSelection:Equatable {
    let scope:NativeDataScope
    let tripID:String
    let headVersion:Int
    var valid:Bool{NativeMemoryWire.uuid(tripID) && (0...999_999_999).contains(headVersion)}
}
@MainActor @Observable final class NativeLinkedTripDeletionStore {
    private(set) var selection:NativeLinkedTripDeleteSelection?
    private(set) var generation=UUID()
    private(set) var requestID:String?
    private(set) var confirmed=false
    private(set) var busy=false
    private(set) var notice:String?
    private(set) var plan:NativeLinkedTripDeletePlan?
    private(set) var receipt:NativeLinkedTripDeleteReceipt?
    private var request:NativeLinkedTripDeleteRequest?
    private var deadline:TimeInterval=0
    private var pendingBody:Data?
    init(){}
    func bind(_ next:NativeLinkedTripDeleteSelection?) {
        guard selection != next else{return};clear();selection=next?.valid==true ? next:nil
    }
    func clear(){generation=UUID();selection=nil;requestID=nil;confirmed=false;busy=false;notice=nil;pendingBody=nil;plan=nil;receipt=nil;request=nil;deadline=0}
    func visiblePlan(_ current:NativeLinkedTripDeleteSelection?)->NativeLinkedTripDeletePlan? {
        guard current != nil,current==selection,let plan,ProcessInfo.processInfo.systemUptime<deadline,let expires=NativeCoreDate.utc(plan.expiresAt),Date()<expires else{return nil};return plan
    }
    func preview(current:@escaping()->NativeLinkedTripDeleteSelection?,read:(Data)async throws->Data)async {
        guard !busy,request==nil,let selected=selection,current()==selected else{return}
        let own=generation,started=ProcessInfo.processInfo.systemUptime;plan=nil;receipt=nil;confirmed=false;busy=true
        defer{if generation==own{busy=false}}
        do {
            let bytes=try await read(JSONSerialization.data(withJSONObject:["action":"preview","tripId":selected.tripID,"expectedVersion":selected.headVersion]))
            guard generation==own,current()==selected,!Task.isCancelled else{return}
            let value=try NativeLinkedTripDeletePlan.decode(bytes,target:selected)
            guard let expires=NativeCoreDate.utc(value.expiresAt),ProcessInfo.processInfo.systemUptime-started<300 else{throw NativeDataError.invalidResponse}
            plan=value;deadline=started+min(300,expires.timeIntervalSinceNow);notice=nil
        }catch{if generation==own,current()==selected{notice="unavailable";plan=nil}}
    }
    func confirm(reviewed:Bool,exportsReviewed:Bool,reviewIdentity:String?,persist:(NativeLinkedTripDeleteRequest,Data)throws->Void,current:@escaping()->NativeLinkedTripDeleteSelection?,post:(Data)async throws->Data)async {
        guard let selected=selection,current()==selected else{return}
        if request==nil {
            guard reviewed,let plan=visiblePlan(selected),reviewIdentity==plan.reviewIdentity,plan.conflicts.isEmpty,plan.selection.exportRequestIds.isEmpty || exportsReviewed else{return}
            let command=NativeLinkedTripDeleteRequest(plan:plan)
            do{let body=try JSONEncoder().encode(command);try persist(command,body);try freezeReviewedRequest(body,requestID:command.requestId,reviewed:true,current:selected);request=command}catch{notice="unavailable";return}
        }
        guard let command=request else{return}
        await performConfirmed(current:current,post:post){[self] bytes,id in
            guard id==command.requestId else{throw NativeDataError.invalidResponse}
            receipt=try NativeLinkedTripDeleteReceipt.decode(bytes,request:command,tripID:selected.tripID)
            plan=nil;deadline=0
        }
    }
    func restore(_ journal:NativeLinkedTripDeleteJournal,target:NativeLinkedTripDeleteSelection)throws {
        let saved=try journal.decodedRequest()
        guard selection==target,try journal.matches(target) else{throw NativeDataError.invalidResponse}
        request=saved;requestID=saved.requestId;pendingBody=journal.body;confirmed=true;plan=nil;receipt=nil;notice="unconfirmed"
    }
    func readReceipt(current:@escaping()->NativeLinkedTripDeleteSelection?,get:(String)async throws->Data)async {
        guard !busy,let selected=selection,current()==selected,let request else{return}
        let own=generation;busy=true;defer{if generation==own{busy=false}}
        do{let bytes=try await get(request.requestId);guard generation==own,current()==selected,!Task.isCancelled else{return};receipt=try NativeLinkedTripDeleteReceipt.decode(bytes,request:request,tripID:selected.tripID);notice=nil}
        catch{if generation==own,current()==selected{notice="unconfirmed"}}
    }

    /// Only a separate explicit native confirmation freezes a server-built body.
    /// The body must already have passed the fixed contract decoder/preview checks.
    func freezeReviewedRequest(_ body:Data,requestID:String,reviewed:Bool,current:NativeLinkedTripDeleteSelection?)throws {
        guard reviewed,selection==current,current?.valid==true,NativeMemoryWire.uuid(requestID),!body.isEmpty,body.count<=192000,!busy else{throw NativeDataError.invalidResponse}
        if let pendingBody {guard pendingBody==body,self.requestID==requestID else{throw NativeDataError.invalidResponse};return}
        self.requestID=requestID;pendingBody=body;confirmed=true;notice=nil
    }
    /// Unknown outcome retains the same operation bytes; no automatic new POST.
    func performConfirmed(current:@escaping()->NativeLinkedTripDeleteSelection?,post:(Data)async throws->Data,accept:(Data,String)throws->Void)async {
        guard !busy,confirmed,selection==current(),let requestID,let body=pendingBody else{return}
        let own=generation,selected=selection;busy=true;defer{if generation==own{busy=false}}
        do {
            let data=try await post(body)
            guard generation==own,selection==selected,current()==selected,!Task.isCancelled else{return}
            try accept(data,requestID);notice=nil
        }catch{
            guard generation==own,selection==selected,current()==selected else{return}
            if case NativeDataError.server(let code)=error,["UNAUTHENTICATED","SESSION_REPLACED","FORBIDDEN"].contains(code){clear();return}
            notice="unconfirmed"
        }
    }
    func matchesCurrent(_ expected:NativeLinkedTripDeleteSelection?,generation:UUID)->Bool{expected != nil && expected==selection && self.generation==generation}
}
