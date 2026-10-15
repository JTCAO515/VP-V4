from pathlib import Path
import subprocess, tempfile
root = Path(__file__).resolve().parents[3]
app = root / 'ios/VisePanda/VisePanda'
trip = (app/'Features/Trip/NativeTripModels.swift').read_text().split('/// Deliberately bounded outline')[0]
support = (app/'Features/Trip/Support/NativeTripSupportModels.swift').read_text().split('struct NativePreparedTripSupport:')[0]
session = (app/'App/NativeSession.swift').read_text()
scope = session[session.index('struct NativeDataScope:'):session.index('private struct NativeDataFailure:')]
knowledge = (app/'Features/Knowledge/NativeKnowledgeModels.swift').read_text()
date = knowledge[knowledge.index('    static func date(_ value: String)'):knowledge.index('\nstruct NativeKnowledgeAnswer:')]
# Scalar dependencies only. No fake Session/transport/auth, App, or Proposal success.
helpers = '''import Foundation
enum NativeMemoryWire { static func uuid(_ value:String)->Bool { UUID(uuidString:value) != nil } }
enum NativeQualifiedDelegationRPC { static func digest(_ value:String)->Bool { value.range(of:"^[a-f0-9]{64}$",options:.regularExpression) != nil } }
enum NativeKnowledgeRead {
''' + date + '\n' + scope
with tempfile.TemporaryDirectory(prefix='ios004-native-') as path:
    temp = Path(path)
    (temp/'Models.swift').write_text(helpers + trip + support)
    files = [str(temp/'Models.swift'), str(app/'Features/TripAddress/NativeTripAddressValue.swift'), str(app/'Features/TripAddress/NativeTripAddressRead.swift'), str(Path(__file__).with_name('Checks.swift'))]
    subprocess.run(['xcrun', 'swiftc', '-parse-as-library', '-swift-version', '6', '-module-cache-path', str(temp/'cache'), *files, '-o', str(temp/'checks')], check=True)
    subprocess.run([str(temp/'checks')], check=True)
