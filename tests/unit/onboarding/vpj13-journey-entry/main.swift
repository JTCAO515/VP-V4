import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ name: String) {
    precondition(condition(), name)
}
expect(NativeJourneyEntryContinuation.relationship(authorized: true, pending: false, goalVersion: nil, hasCurrentParent: false) == "goal_start", "first idea starts one goal")
expect(NativeJourneyEntryContinuation.relationship(authorized: true, pending: false, goalVersion: 3, hasCurrentParent: true) == "follow_up", "return continues original goal")
expect(NativeJourneyEntryContinuation.relationship(authorized: true, pending: false, goalVersion: 3, hasCurrentParent: false) == nil, "missing parent never duplicates existing goal")
expect(NativeJourneyEntryContinuation.relationship(authorized: true, pending: false, goalVersion: 10001, hasCurrentParent: true) == nil, "terminal goal stays read only")
expect(NativeJourneyEntryContinuation.relationship(authorized: false, pending: false, goalVersion: 3, hasCurrentParent: true) == nil, "no authority blocks submission")
expect(NativeJourneyEntryContinuation.relationship(authorized: true, pending: true, goalVersion: 3, hasCurrentParent: true) == nil, "pending admission blocks another submission")
expect(!NativeJourneyEntryContinuation.validIdea(" \n"), "blank input")
expect(NativeJourneyEntryContinuation.validIdea("想去海边，日期没定"), "no-date idea remains literal")
expect(NativeJourneyEntryContinuation.validIdea(String(repeating: "😀", count: 2000)), "wire limit counts UTF16")
expect(!NativeJourneyEntryContinuation.validIdea(String(repeating: "😀", count: 2001)), "oversized input rejected without truncation")
print("PASS 10 continuation/input cases; source-only, no server or device claim")
