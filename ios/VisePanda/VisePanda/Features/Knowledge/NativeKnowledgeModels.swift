import Foundation

struct NativeKnowledgeSelection: Codable, Hashable, Sendable {
    var city = "shanghai"
    var scene = "arrival"
    var locale = "en"

    static let cities = ["shanghai", "beijing", "guangzhou", "chongqing"]
    static let scenes = ["arrival", "airport_transport", "payment", "connectivity", "public_transport", "taxi", "rail", "attraction", "accommodation", "emergency"]
    var valid: Bool { Self.cities.contains(city) && Self.scenes.contains(scene) && ["zh", "en"].contains(locale) }
    var queryItems: [URLQueryItem] {
        [URLQueryItem(name: "city", value: city), URLQueryItem(name: "scene", value: scene), URLQueryItem(name: "locale", value: locale)]
    }
}

struct NativeKnowledgeReply: Decodable {
    let data: NativeKnowledgeRead
}

struct NativeKnowledgeRead: Decodable, Equatable {
    let schemaVersion: String
    let evaluatedAt: String
    let scope: NativeKnowledgeSelection
    let purpose: String
    let recipient: String
    let territory: String
    let status: String
    let statements: [NativeKnowledgeStatement]
    let answer: NativeKnowledgeAnswer?

    /// A snapshot may live at most30 seconds and never beyond the server's expiry.
    /// Subtract the full request duration conservatively; wall-clock rollback cannot extend it.
    func lifetime(for selection: NativeKnowledgeSelection, elapsed: TimeInterval, question: Bool = false, questionId: String = "rail_boarding_documents") throws -> TimeInterval {
        guard selection.valid, scope == selection, schemaVersion == (question ? "knowledge-answer/1" : "knowledge-read/1"),
              question ? (selection.scene == NativeKnowledgeAnswer.definition(questionId)?.scene && answer?.questionId == questionId && answer?.valid(statements: statements) == true) : answer == nil,
              purpose == "trip_planning", recipient == "first_party", territory == "CN-mainland",
              statements.count <= 50, Set(statements.map(\.id)).count == statements.count,
              status == (statements.isEmpty ? "no_eligible_content" : "available"),
              let evaluated = Self.date(evaluatedAt), elapsed.isFinite, elapsed >= 0 else {
            throw NativeDataError.invalidResponse
        }
        var remaining: TimeInterval = 30
        for row in statements {
            guard row.valid, let expires = Self.date(row.expiresAt),
                  let reviewed = Self.date(row.reviewedAt), let published = Self.date(row.publishedAt),
                  reviewed <= published, published <= evaluated, expires > evaluated else {
                throw NativeDataError.invalidResponse
            }
            remaining = min(remaining, expires.timeIntervalSince(evaluated))
        }
        guard remaining > elapsed else { throw NativeDataError.invalidResponse }
        return remaining - elapsed
    }

    static func date(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let result = formatter.date(from: value) { return result }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}

struct NativeKnowledgeAnswer: Decodable, Equatable {
    let questionId: String
    let questionVersion: Int
    let outcome: String
    let claims: [Claim]
    static let required = ["original_valid_booking_id", "valid_ticket_not_itinerary_or_receipt"]
    struct Obligation {
        let subject: String
        let predicate: String
        let object: String
    }
    static func definition(_ id: String) -> (scene: String, claims: [Obligation])? {
        let card = Obligation(subject: "international_card_payment", predicate: "requires_action", object: "merchant_acceptance_check")
        let mobile = Obligation(subject: "alipay_weixin_pay", predicate: "offers_procedure", object: "supported_card_merchant_qr_payment")
        let cash = ["international_card_atm_withdrawal", "marked_currency_exchange"].map {
            Obligation(subject: "rmb_cash_access", predicate: "offers_procedure", object: $0)
        }
        let simDocuments = Obligation(subject: "china_carrier_sim_application", predicate: "requires_document", object: "passport_or_foreign_permanent_resident_id")
        let simPlan = Obligation(subject: "china_carrier_sim_application", predicate: "requires_action", object: "plan_allowance_check")
        switch id {
        case "rail_boarding_documents": return ("rail", required.map { Obligation(subject: "rail_eticket_boarding", predicate: "requires_document", object: $0) })
        case "payment_card_acceptance": return ("payment", [card])
        case "payment_mobile_setup": return ("payment", [mobile])
        case "payment_cash_access": return ("payment", cash)
        case "payment_card_and_mobile": return ("payment", [card, mobile])
        case "payment_card_and_cash": return ("payment", [card] + cash)
        case "payment_mobile_and_cash": return ("payment", [mobile] + cash)
        case "payment_getting_started": return ("payment", [card, mobile] + cash)
        case "connectivity_sim_documents": return ("connectivity", [simDocuments])
        case "connectivity_plan_allowances": return ("connectivity", [simPlan])
        case "connectivity_getting_started": return ("connectivity", [simDocuments, simPlan])
        default: return nil
        }
    }
    struct Claim: Decodable, Equatable, Identifiable {
        let id: String
        let status: String
        let reasons: [String]
        let factIds: [String]
    }
    func valid(statements: [NativeKnowledgeStatement]) -> Bool {
        guard let definition = Self.definition(questionId), questionVersion == 1,
              claims.map(\.id) == definition.claims.map(\.object) else { return false }
        let ids = claims.flatMap(\.factIds)
        guard Set(ids).count == ids.count, Set(ids) == Set(statements.map(\.id)),
              outcome == (claims.allSatisfy { $0.status == "covered" } ? "answered" : statements.isEmpty ? "no_answer" : "partial") else { return false }
        for claim in claims {
            switch claim.status {
            case "covered":
                guard !claim.factIds.isEmpty, claim.reasons.isEmpty else { return false }
                for id in claim.factIds {
                    guard let row = statements.first(where: { $0.id == id }),
                          let obligation = definition.claims.first(where: { $0.object == claim.id }),
                          row.assertion.subjectId == obligation.subject, row.assertion.predicate == obligation.predicate,
                          row.assertion.objectId == claim.id else { return false }
                }
            case "unresolved_variants":
                guard claim.factIds.isEmpty, claim.reasons == ["unresolved_variants"] else { return false }
            case "unavailable":
                guard claim.factIds.isEmpty, !claim.reasons.isEmpty, Set(claim.reasons).count == claim.reasons.count,
                      claim.reasons.allSatisfy({ ["missing", "expired", "revoked", "unreviewed"].contains($0) }),
                      !claim.reasons.contains("missing") || claim.reasons.count == 1 else { return false }
            default: return false
            }
        }
        return true
    }
}

struct NativeKnowledgeStatement: Decodable, Equatable, Identifiable {
    let factId: String
    let version: Int
    let assertionId: String
    let assertionRevision: Int
    let assertion: Assertion
    let text: String
    let conditions: [String]
    let exclusions: [String]
    let reviewedAt: String
    let publishedAt: String
    let expiresAt: String
    let sources: [Source]
    var id: String { factId }

    struct Assertion: Decodable, Equatable {
        let subjectId: String
        let predicate: String
        let objectId: String
        let conditions: [String]
        let exclusions: [String]
    }
    struct Source: Decodable, Equatable, Identifiable {
        let sourceRevisionId: String
        let publisher: String
        let uri: String
        let locator: String
        var id: String { sourceRevisionId }
        var url: URL? {
            guard let url = URL(string: uri), ["https", "http"].contains(url.scheme),
                  url.host != nil, url.user == nil, url.password == nil else { return nil }
            return url
        }
    }
    var valid: Bool {
        UUID(uuidString: factId) != nil && UUID(uuidString: assertionId) != nil && version == 1 && assertionRevision == 1 &&
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && text.count <= 1000 &&
        conditions.count == assertion.conditions.count && exclusions.count == assertion.exclusions.count &&
        conditions.count <= 12 && exclusions.count <= 12 &&
        (conditions + exclusions).allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.count <= 240 } &&
        (1...3).contains(sources.count) && Set(sources.map(\.id)).count == sources.count &&
        sources.allSatisfy { UUID(uuidString: $0.id) != nil && !$0.publisher.isEmpty && !$0.locator.isEmpty }
    }
}
