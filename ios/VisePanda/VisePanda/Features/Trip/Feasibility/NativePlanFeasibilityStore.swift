import Foundation
import Observation

@MainActor @Observable final class NativePlanFeasibilityStore {
    private(set) var target:NativePlanFeasibilityTarget?
    private(set) var choices:[NativePlanPlaceChoice]=[]
    private(set) var result:NativePlanFeasibilityRead?
    private(set) var busy=false
    private(set) var notice:String?
    private var generation=UUID()
    private var deadline:TimeInterval=0
    func bind(_ next:NativePlanFeasibilityTarget?) {
        guard next != target else{return};target=next;generation=UUID();choices=[];result=nil;busy=false;notice=nil;deadline=0
    }
    func choose(_ choice:NativePlanPlaceChoice){guard !busy,choice.valid,target != nil else{return};choices.removeAll{$0.itemId==choice.itemId};if choices.count<40{choices.append(choice)};invalidate()}
    func remove(_ id:String){guard !busy else{return};choices.removeAll{$0.itemId==id};invalidate()}
    func invalidate(){generation=UUID();result=nil;notice=nil;deadline=0}
    func visible(_ current:NativePlanFeasibilityTarget?)->NativePlanFeasibilityRead? {
        guard current != nil,current==target,ProcessInfo.processInfo.systemUptime<deadline,let result,result.evidenceBasis.allSatisfy({$0.facts.allSatisfy{NativeKnowledgeRead.date($0.expiresAt).map{$0>Date()}==true}}) else{return nil};return result
    }
    func check(needs:NativePlanNeeds,after:NativeTripContent?=nil,current:()->NativePlanFeasibilityTarget?,post:(Data)async throws->Data)async {
        guard !busy,let target,current()==target else{return}
        let own=generation,started=ProcessInfo.processInfo.systemUptime;busy=true;result=nil;deadline=0
        defer{if generation==own{busy=false}}
        do {
            let request=try NativePlanFeasibilityRequest(target:target,needs:needs,choices:choices),bytes=try JSONEncoder().encode(request)
            guard bytes.count<=8192 else{notice="inputTooLarge";return}
            let response=try await post(bytes)
            guard generation==own,current()==target,!Task.isCancelled else{return}
            result=try NativePlanFeasibilityRead.decode(response,target:target,choices:choices,after:after);deadline=started+30;notice=result==nil ? "changed":nil
        }catch{guard generation==own,current()==target else{return};notice="unavailable"}
    }
}
