import XCTest
@testable import VisePanda

nonisolated final class NativeScreenshotProposalRecoveryTests: XCTestCase {
    @MainActor
    func testLostProposalReadRecoversWithoutSecondPost() async throws {
        ScreenshotProposalProtocol.reset()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenshotProposalProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj12.proposal.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59989"],
                                    defaults: defaults, configuration: configuration)
        await session.login(email: "synthetic", password: "unit-only")
        let scope = try XCTUnwrap(session.dataScope)
        let store = NativeTripStore()
        store.reset(for: scope)
        await store.select(ScreenshotProposalProtocol.tripID, using: session)
        let detail = try XCTUnwrap(store.detail, store.notice ?? "Trip did not load")
        let source = NativeScreenshotReviewSource(tripID: detail.trip.id,
                                                   tripVersion: detail.trip.headVersion,
                                                   tripDates: detail.content.days.map(\.date),
                                                   ownerID: scope.subject, detail: detail)
        let corrections = [
            NativeScreenshotCorrection(id: UUID(), kind: .date, sourceLine: 1,
                                       sourceText: "2026-10-01", correctedValue: "2026-10-01"),
            NativeScreenshotCorrection(id: UUID(), kind: .amount, sourceLine: 2,
                                       sourceText: "CNY 128", correctedValue: "CNY 128"),
        ]
        let digest = String(repeating: "a", count: 64)
        guard case .ready(let draft, _) = NativeScreenshotTripDraft.make(detail: detail, digest: digest, corrections: corrections) else {
            return XCTFail("Expected a proposal patch")
        }
        ScreenshotProposalProtocol.setPatch(try JSONEncoder().encode(draft.patch))

        let firstAttempt = await store.proposeScreenshot(source: source, digest: digest,
                                                         corrections: corrections, using: session)
        XCTAssertFalse(firstAttempt)
        XCTAssertEqual(ScreenshotProposalProtocol.postCount, 1)
        XCTAssertNil(store.pending)
        XCTAssertNotNil(store.draft)
        XCTAssertTrue(store.hasUncertainProposal)
        store.discardDraft()
        XCTAssertNotNil(store.draft, "Do not discard a draft while its remote proposal outcome is unknown")

        await store.propose(using: session)
        XCTAssertEqual(ScreenshotProposalProtocol.postCount, 1, "An uncertain acknowledgement must be read, not posted again")
        XCTAssertEqual(store.pending?.proposal.patch, draft.patch)
        XCTAssertFalse(store.hasUncertainProposal)
        XCTAssertEqual(store.notice, "reviewRequired")
        await session.logout()
    }

    @MainActor
    func testDefiniteStaleRejectionUnlocksLocalDraft() async throws {
        ScreenshotProposalProtocol.reset()
        ScreenshotProposalProtocol.setRejectPostAsStale(true)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ScreenshotProposalProtocol.self]
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "vpj12.stale.\(UUID().uuidString)"))
        let session = NativeSession(arguments: ["-VisePandaNativeAPI", "http://127.0.0.1:59989"],
                                    defaults: defaults, configuration: configuration)
        await session.login(email: "synthetic", password: "unit-only")
        let scope = try XCTUnwrap(session.dataScope)
        let store = NativeTripStore()
        store.reset(for: scope)
        await store.select(ScreenshotProposalProtocol.tripID, using: session)
        let detail = try XCTUnwrap(store.detail)
        let source = NativeScreenshotReviewSource(tripID: detail.trip.id, tripVersion: detail.trip.headVersion,
                                                   tripDates: [], ownerID: scope.subject, detail: detail)
        let correction = NativeScreenshotCorrection(id: UUID(), kind: .date, sourceLine: 1,
                                                     sourceText: "2026-10-01", correctedValue: "2026-10-01")
        let accepted = await store.proposeScreenshot(source: source, digest: String(repeating: "b", count: 64),
                                                     corrections: [correction], using: session)
        XCTAssertFalse(accepted)
        XCTAssertEqual(store.notice, "STALE_TRIP_VERSION")
        XCTAssertFalse(store.hasUncertainProposal)
        XCTAssertNotNil(store.draft)
        store.discardDraft()
        XCTAssertNil(store.draft)
        await session.logout()
    }
}

nonisolated private final class ScreenshotProposalProtocol: URLProtocol, @unchecked Sendable {
    static let subject = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    static let tripID = "11111111-1111-4111-8111-111111111111"
    static let proposalID = "22222222-2222-4222-8222-222222222222"
    private static let lock = NSLock()
    nonisolated(unsafe) private static var posts = 0
    nonisolated(unsafe) private static var reads = 0
    nonisolated(unsafe) private static var patch: Data?
    nonisolated(unsafe) private static var rejectPostAsStale = false
    static var postCount: Int { lock.withLock { posts } }
    static func reset() { lock.withLock { posts = 0; reads = 0; patch = nil; rejectPostAsStale = false } }
    static func setPatch(_ value: Data) { lock.withLock { patch = value } }
    static func setRejectPostAsStale(_ value: Bool) { lock.withLock { rejectPostAsStale = value } }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}
    override func startLoading() {
        let path = request.url?.path ?? ""
        if path.hasSuffix("/credentials") {
            respond(["subject": Self.subject, "accessToken": "synthetic", "refreshToken": "synthetic",
                     "expiresAt": Date().timeIntervalSince1970 + 3600])
        } else if path.hasSuffix("/login") {
            respond(["subject": Self.subject, "mobileEpoch": 1])
        } else if path.hasSuffix("/profile") {
            respond(["subject": Self.subject, "displayName": "Synthetic"])
        } else if path.hasSuffix("/logout") {
            respond(["status": "signedOut"])
        } else if path == "/api/trips/native/v2/\(Self.tripID)" {
            respond(["version": 2, "trip": Self.trip, "content": ["days": []],
                     "hardLocks": "not_enabled", "externalOrderStatus": "not_connected",
                     "confirmationState": "confirmed"])
        } else if path.hasSuffix("/proposal") && request.httpMethod == "POST" {
            let stale = Self.lock.withLock { Self.posts += 1; return Self.rejectPostAsStale }
            if stale { respond(["error": ["code": "STALE_TRIP_VERSION"]], status: 409) }
            else { respond(["version": 2, "proposalId": Self.proposalID, "revision": 1, "baseTripVersion": 1], status: 201) }
        } else if path.hasSuffix("/proposal") {
            let read = Self.lock.withLock { () -> (Int, Int, Data?) in
                Self.reads += 1
                return (Self.reads, Self.posts, Self.patch)
            }
            if read.1 == 0 {
                respond(["error": ["code": "PROPOSAL_NOT_CONFIRMABLE"]], status: 409)
            } else if read.0 == 2 {
                client?.urlProtocol(self, didFailWithError: URLError(.networkConnectionLost))
            } else if let patch = read.2,
                      let object = try? JSONSerialization.jsonObject(with: patch) {
                respond(["version": 2, "trip": Self.trip,
                         "proposal": ["id": Self.proposalID, "revision": 1, "baseTripVersion": 1,
                                      "status": "pending", "createdAt": "2026-09-18T00:00:00Z",
                                      "expiresAt": "2026-09-19T00:00:00Z", "titleDiff": ["before": "Saved", "after": "Saved"],
                                      "dayDiffs": [], "patch": object, "digest": "synthetic-digest",
                                      "stale": false, "evidence": "synthetic", "assumptions": "synthetic"]])
            }
        }
    }
    private static var trip: [String: Any] {
        ["id": tripID, "title": "Saved", "headVersion": 1, "updatedAt": "2026-09-18T00:00:00Z"]
    }
    private func respond(_ value: [String: Any], status: Int = 200) {
        guard let url = request.url,
              let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil,
                                             headerFields: ["Content-Type": "application/json"]),
              let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
}
