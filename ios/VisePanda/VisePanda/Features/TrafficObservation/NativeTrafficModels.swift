import Foundation
import CoreFoundation

/// Mirrors #366's bounded server receipt. Client fields locate server authority only.
struct NativeTrafficReceipt: Decodable, Equatable {
    struct Summary: Decodable, Equatable {
        let mode: String
        let durationSeconds: Int
        let distanceMeters: Int
        let tmc: [String: Double]?
        static func validate(_ raw: Any) throws {
            let row = try NativeRecoveryWire.exact(raw, ["mode", "durationSeconds", "distanceMeters", "tmc"])
            guard let mode = row["mode"] as? String, ["walking", "transit", "driving"].contains(mode),
                  let duration = NativeRecoveryWire.integer(row["durationSeconds"]), duration <= 604800,
                  let distance = NativeRecoveryWire.integer(row["distanceMeters"]), distance <= 100000000 else { throw NativeDataError.invalidResponse }
            if !(row["tmc"] is NSNull) {
                guard mode == "driving" else { throw NativeDataError.invalidResponse }
                let tmc = try NativeRecoveryWire.exact(row["tmc"] as Any, ["unknown", "smooth", "slow", "congested", "severely_congested"])
                try NativeTrafficWire.meters(tmc)
            }
        }
    }
    let receiptId: String
    let dispatchId: String
    let scope: NativeTransportScope
    let stopEpoch: Int
    let policyId: String
    let policyRevision: Int
    let sourceVersion: String
    let fetchedAt: String
    let providerObservedAt: String?
    let expiresAt: String
    let selected: Summary
    let alternatives: [Summary]
    let previousReceiptId: String?
    let changeKind: String
    let durationDeltaSeconds: Int?
    let routeChangeCaveat: Bool
    let r2Qualified: Bool
    func current(scope: NativeTransportScope, now: Date) -> Bool {
        self.scope == scope && NativeRecoveryWire.date(fetchedAt).map { $0 <= now } == true
        && NativeRecoveryWire.date(expiresAt).map { $0 > now } == true
    }
    var recoveryQualified: Bool { r2Qualified && ["route_estimate_changed", "route_condition_changed"].contains(changeKind) }
    static func decode(_ raw: Any, scope: NativeTransportScope, now: Date) throws -> Self {
        let row = try NativeRecoveryWire.exact(raw, ["receiptId", "dispatchId", "scope", "stopEpoch", "policyId", "policyRevision", "sourceVersion", "fetchedAt", "providerObservedAt", "expiresAt", "selected", "alternatives", "previousReceiptId", "changeKind", "durationDeltaSeconds", "routeChangeCaveat", "r2Qualified"])
        _ = try NativeRecoveryWire.exact(row["scope"] as Any, ["tripId", "expectedHeadVersion", "dayId", "itemId", "originPlaceReferenceId", "destinationPlaceReferenceId", "mode", "departure"])
        try Summary.validate(row["selected"] as Any)
        guard let alternatives = row["alternatives"] as? [Any], alternatives.count <= 2,
              NativeRecoveryWire.integer(row["stopEpoch"]) != nil,
              NativeRecoveryWire.integer(row["policyRevision"]).map({ $0 > 0 }) == true,
              NativeRecoveryWire.boolean(row["routeChangeCaveat"]) == true,
              NativeRecoveryWire.boolean(row["r2Qualified"]) != nil,
              row["providerObservedAt"] is NSNull else { throw NativeDataError.invalidResponse }
        for alternative in alternatives { try Summary.validate(alternative) }
        let value = try NativeRecoveryWire.decode(Self.self, row)
        try value.scope.validate()
        guard value.current(scope: scope, now: now), NativeRecoveryWire.uuid(value.receiptId),
              NativeRecoveryWire.uuid(value.dispatchId), NativeRecoveryWire.uuid(value.policyId),
              value.sourceVersion.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil,
              let fetched = NativeRecoveryWire.date(value.fetchedAt), let expiry = NativeRecoveryWire.date(value.expiresAt),
              expiry <= fetched.addingTimeInterval(300), value.selected.mode == scope.mode,
              value.alternatives.allSatisfy({ $0.mode != scope.mode }),
              Set(value.alternatives.map(\.mode)).count == value.alternatives.count,
              value.previousReceiptId == nil || NativeRecoveryWire.uuid(value.previousReceiptId!),
              ["route_estimate_changed", "route_condition_changed", "unchanged", "first_observation"].contains(value.changeKind),
              value.durationDeltaSeconds.map({ (-604800...604800).contains($0) }) ?? true else { throw NativeDataError.invalidResponse }
        return value
    }
}

struct NativeTrafficObservation: Decodable {
    struct Traffic: Decodable { let status: String; let meters: [String: Double]? }
    struct Comparison: Decodable { let kind: String; let durationDeltaSeconds: Int?; let caveat: String }
    struct Alternative: Decodable { let option: NativeTrafficReceipt.Summary; let explanation: String; let limitations: String }
    struct Qualification: Decodable { let status: String; let reason: String? }
    struct Policy: Decodable {
        let policyId: String; let version: Int; let sourceId: String; let licenceVersion: String; let expiresAt: String
        let tmcAllowed: Bool?; let allowedEndpointModes: [String]?
    }
    let kind: String
    let status: String
    let receiptId: String
    let fetchedAt: String
    let expiresAt: String
    let provider: String
    let mode: String
    let departure: String
    let providerObservedAt: String?
    let currentness: String
    let traffic: Traffic
    let closure: String
    let realtimeTransit: String
    let prediction: String
    let selected: NativeTrafficReceipt.Summary
    let comparison: Comparison
    let alternatives: [Alternative]
    let durableReceipt: NativeTrafficReceipt?
    let fallback: String
    let providerCalls: Int
    let tripMutation: String
    let qualification: Qualification
    let policy: Policy

    static func decode(_ bytes: Data, scope: NativeTransportScope, previous: String?, now: Date) throws -> Self {
        let row = try NativeRecoveryWire.root(bytes)
        _ = try NativeRecoveryWire.exact(row, ["kind", "status", "receiptId", "fetchedAt", "expiresAt", "provider", "mode", "departure", "providerObservedAt", "currentness", "traffic", "closure", "realtimeTransit", "prediction", "selected", "comparison", "alternatives", "durableReceipt", "fallback", "providerCalls", "tripMutation", "qualification", "policy"])
        _ = try NativeRecoveryWire.exact(row["qualification"] as Any, ["status", "reason"])
        let comparison = try NativeRecoveryWire.exact(row["comparison"] as Any, ["kind", "durationDeltaSeconds", "caveat"])
        guard let comparisonKind = comparison["kind"] as? String,
              ["first_observation", "no_change", "route_estimate_changed", "route_condition_changed", "baseline_expired", "endpoint_changed"].contains(comparisonKind),
              row["providerObservedAt"] is NSNull, NativeRecoveryWire.integer(row["providerCalls"]).map({ (1...5).contains($0) }) == true,
              let alternatives = row["alternatives"] as? [[String: Any]], alternatives.count <= 2 else { throw NativeDataError.invalidResponse }
        try NativeTrafficReceipt.Summary.validate(row["selected"] as Any)
        for alternative in alternatives {
            _ = try NativeRecoveryWire.exact(alternative, ["option", "explanation", "limitations"])
            try NativeTrafficReceipt.Summary.validate(alternative["option"] as Any)
        }
        let traffic = try NativeRecoveryWire.exact(row["traffic"] as Any, ["status", "meters"])
        if !(traffic["meters"] is NSNull) {
            let meters = try NativeRecoveryWire.exact(traffic["meters"] as Any, ["unknown", "clear", "slow", "congested", "severe"])
            try NativeTrafficWire.meters(meters)
        }
        let value = try NativeRecoveryWire.decode(Self.self, row)
        guard value.kind == "foreground_traffic/1", value.status == "observed", value.provider == "amap",
              value.mode == scope.mode, value.departure == "now", value.currentness == "fetch_time_only",
              value.closure == "uncovered", value.realtimeTransit == "uncovered", value.prediction == "unavailable",
              value.tripMutation == "none", value.fallback == "existing_trip_address_and_navigation",
              NativeRecoveryWire.uuid(value.receiptId), let fetched = NativeRecoveryWire.date(value.fetchedAt), fetched <= now,
              let expiry = NativeRecoveryWire.date(value.expiresAt), expiry > now, expiry <= fetched.addingTimeInterval(300),
              value.selected.mode == scope.mode, ["observed", "uncovered"].contains(value.traffic.status),
              (value.traffic.status == "observed") == (value.traffic.meters != nil),
              value.traffic.status != "observed" || scope.mode == "driving",
              value.comparison.durationDeltaSeconds.map({ (-604800...604800).contains($0) }) ?? true,
              ["qualified", "unavailable"].contains(value.qualification.status),
              value.alternatives.allSatisfy({ $0.explanation == "whole_amap_plan_for_same_endpoints" && $0.limitations == "estimate_only_check_transfers_walking_and_tolls" && $0.option.mode != scope.mode }),
              Set(value.alternatives.map { $0.option.mode }).count == value.alternatives.count,
              NativeRecoveryWire.date(value.policy.expiresAt).map({ $0 >= expiry }) == true else { throw NativeDataError.invalidResponse }
        if !(row["durableReceipt"] is NSNull) {
            let receipt = try NativeTrafficReceipt.decode(row["durableReceipt"] as Any, scope: scope, now: now)
            guard receipt.receiptId == value.receiptId, receipt.previousReceiptId == previous,
                  receipt.selected == value.selected, NativeRecoveryWire.date(receipt.fetchedAt) == fetched,
                  NativeRecoveryWire.date(receipt.expiresAt).map({ expiry <= $0 }) == true,
                  receipt.policyId == value.policy.policyId, receipt.policyRevision == value.policy.version,
                  (value.qualification.status == "qualified") == receipt.recoveryQualified,
                  value.qualification.status != "qualified" || value.qualification.reason == nil,
                  !receipt.recoveryQualified || receipt.changeKind == value.comparison.kind else { throw NativeDataError.invalidResponse }
        } else if value.qualification.status == "qualified" { throw NativeDataError.invalidResponse }
        return value
    }
}

enum NativeTrafficWire {
    static func meters(_ values: [String: Any]) throws {
        let numbers = try values.values.map { value -> Double in
            guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
                  number.doubleValue.isFinite, (0...100000000).contains(number.doubleValue) else { throw NativeDataError.invalidResponse }
            return number.doubleValue
        }
        guard numbers.reduce(0, +) <= 100000000 else { throw NativeDataError.invalidResponse }
    }
    static func body(scope: NativeTransportScope, operation: String, consent: Bool, foreground: Bool,
                     previous: String?, stopEpoch: Int?) throws -> Data {
        try scope.validate()
        guard ["check", "refresh", "stop"].contains(operation), previous.map(NativeRecoveryWire.uuid) ?? true,
              stopEpoch.map({ (0...999999999).contains($0) }) ?? true else { throw NativeDataError.invalidResponse }
        var row = try NativeRecoveryWire.object(scope)
        row.removeValue(forKey: "tripId")
        row["operation"] = operation; row["mapConsent"] = consent; row["foreground"] = foreground
        row["previousReceiptId"] = previous as Any? ?? NSNull(); row["movementMeters"] = 0
        row["expectedStopEpoch"] = stopEpoch as Any? ?? NSNull()
        return try NativeRecoveryWire.encode(row)
    }
}

struct NativeTrafficContext: Decodable {
    struct Reference: Decodable, Identifiable {
        struct Display: Decodable { let zh: String; let en: String; let addressLines: [String]; let source: String }
        let referenceId: String; let canonicalPoiId: String; let referenceStatus: String
        let display: Display?; let displayStatus: String; let association: String
        var id: String { referenceId }
    }
    struct Completeness: Decodable { let references: String; let labels: String; let scannedItems: Int; let totalItems: Int }
    struct Stop: Decodable { let status: String; let epoch: Int?; let stopped: Bool? }
    let kind: String; let tripId: String; let headVersion: Int; let dayId: String; let itemId: String
    let references: [Reference]; let completeness: Completeness; let stop: Stop
    let qualification: String; let providerCalls: Int; let tripMutation: String
    func matches(trip: String, version: Int, day: String, item: String) -> Bool {
        tripId == trip && headVersion == version && dayId == day && itemId == item
    }
    static func body(version: Int, day: String, item: String, scope: NativeTransportScope?) throws -> Data {
        guard (0...999999999).contains(version), NativeRecoveryWire.item(day), NativeRecoveryWire.item(item)
        else { throw NativeDataError.invalidResponse }
        if let scope { try scope.validate() }
        return try NativeRecoveryWire.encode(["expectedHeadVersion": version, "dayId": day, "itemId": item,
            "scope": try scope.map(NativeRecoveryWire.object) as Any? ?? NSNull()])
    }
    static func decode(_ bytes: Data, trip: String, version: Int, day: String, item: String) throws -> Self {
        let row = try NativeRecoveryWire.root(bytes)
        _ = try NativeRecoveryWire.exact(row, ["kind", "tripId", "headVersion", "dayId", "itemId", "references", "completeness", "stop", "qualification", "providerCalls", "tripMutation"])
        guard let refs = row["references"] as? [[String: Any]], refs.count <= 100,
              NativeRecoveryWire.integer(row["headVersion"]) == version, NativeRecoveryWire.integer(row["providerCalls"]) == 0 else { throw NativeDataError.invalidResponse }
        for ref in refs {
            _ = try NativeRecoveryWire.exact(ref, ["referenceId", "canonicalPoiId", "referenceStatus", "display", "displayStatus", "association"])
            if !(ref["display"] is NSNull) {
                _ = try NativeRecoveryWire.exact(ref["display"] as Any, ["zh", "en", "addressLines", "source"])
            }
        }
        let completeness = try NativeRecoveryWire.exact(row["completeness"] as Any, ["references", "labels", "scannedItems", "totalItems"])
        guard let scanned = NativeRecoveryWire.integer(completeness["scannedItems"]), scanned <= 24,
              let total = NativeRecoveryWire.integer(completeness["totalItems"]), scanned <= total else { throw NativeDataError.invalidResponse }
        let stop = try NativeRecoveryWire.exact(row["stop"] as Any, ["status", "epoch", "stopped"])
        guard (stop["epoch"] is NSNull || NativeRecoveryWire.integer(stop["epoch"]) != nil),
              (stop["stopped"] is NSNull || NativeRecoveryWire.boolean(stop["stopped"]) != nil) else { throw NativeDataError.invalidResponse }
        let value = try NativeRecoveryWire.decode(Self.self, row)
        guard value.kind == "foreground_traffic_context/1", value.matches(trip: trip, version: version, day: day, item: item),
              value.qualification == "not_granted_by_context", value.tripMutation == "none",
              value.completeness.references == "complete", ["complete", "partial"].contains(value.completeness.labels),
              Set(value.references.map(\.id)).count == refs.count,
              value.references.allSatisfy({ ref in
                  NativeRecoveryWire.uuid(ref.referenceId) && NativeRecoveryWire.uuid(ref.canonicalPoiId)
                  && ref.referenceStatus == "current" && ref.association == "explicit_selection_required"
                  && ["current", "unavailable"].contains(ref.displayStatus)
                  && (ref.displayStatus == "current") == (ref.display != nil)
                  && ref.display.map({ display in
                      display.source == "current_item_support" && !display.zh.isEmpty && !display.en.isEmpty
                      && display.zh.utf16.count <= 2000 && display.en.utf16.count <= 2000 && display.addressLines.count <= 16
                      && display.addressLines.allSatisfy({ !$0.isEmpty && $0.utf16.count <= 160 })
                  }) ?? true
              }),
              (value.stop.status == "current" && value.stop.epoch != nil && value.stop.stopped != nil)
                || (value.stop.status == "unavailable" && value.stop.epoch == nil && value.stop.stopped == nil)
        else { throw NativeDataError.invalidResponse }
        return value
    }
}
