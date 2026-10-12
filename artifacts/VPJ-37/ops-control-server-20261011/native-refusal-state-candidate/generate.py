from pathlib import Path
import hashlib,json,difflib
ROOT=Path(__file__).resolve().parents[4];OUT=Path(__file__).resolve().parent
sha=lambda b:hashlib.sha256(b).hexdigest()
store='ios/VisePanda/VisePanda/Features/Ask/NativeAskStore.swift';view='ios/VisePanda/VisePanda/Features/Ask/NativeAskView.swift'
befores={store:'0339303f27f4a45fad2c46396f5512d060ba3818fa84dd8ddea184348ac5b083',view:'043f01d84004fd88e2c505e8075b1026cad3f0c60b4569f55d07cf9a5c1d593b'}
helper='''    enum OpsRefusal: String, Equatable {
        case controlDisabled = "ops_control_disabled"
        case scopeUnavailable = "ops_scope_unavailable"
    }
    static func aiAssistRefusal(_ bytes: Data, current: Bool, now: ContinuousClock.Instant, deadline: ContinuousClock.Instant) -> OpsRefusal? {
        guard current, now < deadline, bytes.count <= 2048,
              let text = String(data: bytes, encoding: .utf8),
              let root = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(root.keys) == ["data"], let data = root["data"] as? [String: Any],
              let status = data["status"] as? String else { return nil }
        let reason: String
        let expectedStrings: Int
        if status == "not_offered" {
            guard Set(data.keys) == ["status", "reason"], let value = data["reason"] as? String else { return nil }
            reason = value; expectedStrings = 5
        } else if status == "succeeded" {
            guard Set(data.keys) == ["status", "outcome"], let outcome = data["outcome"] as? [String: Any],
                  Set(outcome.keys) == ["kind", "reason"], outcome["kind"] as? String == "unavailable",
                  let value = outcome["reason"] as? String else { return nil }
            reason = value; expectedStrings = 8
        } else { return nil }
        // These closed envelopes contain only known string keys/values. More
        // string tokens reveal duplicate keys before Foundation discards them.
        guard let strings = try? NSRegularExpression(pattern: #"\"(?:[^\"\\\\]|\\\\.)*\""#),
              strings.numberOfMatches(in: text, range: NSRange(text.startIndex..., in: text)) == expectedStrings else { return nil }
        return OpsRefusal(rawValue: reason)
    }
'''
entries=[]
for name in (store,view):
 before=(ROOT/name).read_text();assert sha(before.encode())==befores[name];after=before
 if name==store:
  old='    enum AiAssistState: Equatable { case loading, done(NativeAiAssistStatus), error }';assert after.count(old)==1
  after=after.replace(old,helper+'    enum AiAssistState: Equatable { case loading, done(NativeAiAssistStatus), opsRefused(OpsRefusal), error }',1)
  old='                let reply = try JSONDecoder().decode(NativeAiAssistReply.self, from: data)';assert after.count(old)==1
  after=after.replace(old,'''                if let refusal = Self.aiAssistRefusal(data, current: aiAssistTokens[turnId] == token && scope == current && session.dataScope == current, now: .now, deadline: deadline) {
                    aiAssist[turnId] = .opsRefused(refusal)
                    return
                }
'''+old,1)
 else:
  old='''        if case .done(let status)=store.aiAssist[turn.id], ["ops_control_disabled","ops_scope_unavailable"].contains(status.reason ?? status.outcome?.reason ?? "") {
            Text(chinese ? "此能力暂时停用，或当前城市范围无法核实。已有成果保留，不自动重发。" : "This capability is paused or the current city scope cannot be qualified. Saved results are retained; no automatic retry.")
                .accessibilityIdentifier("grounded.ai-assist.ops-refusal")
            NavigationLink(destination: NativeJourneysView()) {Text(chinese ? "查看已有行程与成果" : "Open existing Trips and results")}
        } else {
        switch store.aiAssist[turn.id] {'''
  assert after.count(old)==1;after=after.replace(old,'''        switch store.aiAssist[turn.id] {''',1)
  old='''        case .done(let reply):
            aiAssistResult(turn, reply, chinese: chinese)
        }
        }
    }''';assert after.count(old)==1
  after=after.replace(old,'''        case .opsRefused:
            Text(chinese ? "此能力暂时停用，或当前城市范围无法核实。已有成果保留，不自动重发。" : "This capability is paused or the current city scope cannot be qualified. Saved results are retained; no automatic retry.")
                .accessibilityIdentifier("grounded.ai-assist.ops-refusal")
            NavigationLink(destination: NativeJourneysView()) {Text(chinese ? "查看已有行程与成果" : "Open existing Trips and results")}
        case .done(let reply):
            aiAssistResult(turn, reply, chinese: chinese)
        }
    }''',1)
 target=OUT/(Path(name).name);Path(str(target)+'.before.txt').write_text(before);Path(str(target)+'.after.txt').write_text(after)
 patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+name,tofile='b/'+name,n=0));Path(str(target)+'.patch').write_text(patch)
 entries.append({'path':name,'beforeSha256':sha(before.encode()),'afterSha256':sha(after.encode()),'patchSha256':sha(patch.encode()),'applied':False,'lease':'HOLD new exact hunk release required'})
(OUT/'helper.swift.txt').write_text(helper)
(OUT/'pins.json').write_text(json.dumps({'scope':'Only dedicated closed Ops refusal consumer state; NativeAskModels unchanged','files':entries},indent=2)+'\n')
print('2 new dedicated-state full candidates generated; no shared apply')
