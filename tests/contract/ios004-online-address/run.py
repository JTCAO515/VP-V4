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
editor = (app/'Features/TripAddress/NativeTripAddressEditor.swift').read_text()
store = (app/'Features/Trip/NativeTripStore.swift').read_text()
# Source-bound wiring checks supplement executable production recovery-state tests below.
assert 'if store.hasUncertainProposal {\n                Button(text("Read the original proposal"' in editor
prepare = editor.split('private func prepare() async {', 1)[1].split('private func confirm()', 1)[0]
assert '!store.hasUncertainProposal' not in prepare
unknown = store.split('if proposalOutcomeUnknown {', 1)[1].split('func ownsAddressDraft()', 1)[0]
assert 'NativeTripAddressProposalRecovery.read' in unknown and 'await propose(' not in unknown and '"POST"' not in unknown
with tempfile.TemporaryDirectory(prefix='ios004-native-') as path:
    temp = Path(path)
    (temp/'Models.swift').write_text(helpers + trip + support)
    files = [str(temp/'Models.swift'), str(app/'Features/TripAddress/NativeTripAddressValue.swift'), str(app/'Features/TripAddress/NativeTripAddressRead.swift'), str(Path(__file__).with_name('Checks.swift'))]
    subprocess.run(['xcrun', 'swiftc', '-parse-as-library', '-swift-version', '6', '-module-cache-path', str(temp/'cache'), *files, '-o', str(temp/'checks')], check=True)
    subprocess.run([str(temp/'checks')], check=True)
    sdk = subprocess.check_output(['xcrun', '--sdk', 'iphonesimulator', '--show-sdk-path'], text=True).strip()
    subprocess.run(['xcrun', 'swiftc', '-typecheck', '-parse-as-library', '-swift-version', '6', '-sdk', sdk, '-target', 'arm64-apple-ios17.0-simulator', '-module-cache-path', str(temp/'ios-cache'), *files], check=True)
    print('PASS iOS Simulator SDK typecheck: actual Foundation address/DTO/draft/source/recovery code; no App or simulated service')
