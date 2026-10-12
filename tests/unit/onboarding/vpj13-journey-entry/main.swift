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
let conversation = "00000000-0000-4000-8000-000000000001"
let goal = "00000000-0000-4000-8000-000000000002"
let message = "00000000-0000-4000-8000-000000000003"
let anchor = NativeJourneyReadAnchor(conversationID: conversation, goalID: goal, goalVersion: 2, messageID: message)
expect(anchor.accepts(anchor, started: 100, now: 119), "same-source read within deadline")
expect(!anchor.accepts(anchor, started: 100, now: 120), "deadline includes network time")
expect(!anchor.accepts(anchor, started: 100, now: 99), "clock rollback fails closed")
expect(!anchor.accepts(anchor, started: 100, now: .infinity), "invalid clock fails closed")
expect(!anchor.accepts(.init(conversationID: goal, goalID: goal, goalVersion: 2, messageID: message), started: 100, now: 101), "other conversation rejected")
expect(!anchor.accepts(.init(conversationID: conversation, goalID: message, goalVersion: 2, messageID: message), started: 100, now: 101), "other goal rejected")
expect(!anchor.accepts(.init(conversationID: conversation, goalID: goal, goalVersion: 3, messageID: message), started: 100, now: 101), "changed goal version rejected")
expect(!anchor.accepts(.init(conversationID: conversation, goalID: goal, goalVersion: 2, messageID: goal), started: 100, now: 101), "different input parent rejected")
print("PASS 18 continuation/input/source-read cases; source-only, no server or device claim")
