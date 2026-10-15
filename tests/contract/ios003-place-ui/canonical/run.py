from pathlib import Path
import subprocess, tempfile, sys
root = Path(__file__).resolve().parents[4]
app = root/'ios/VisePanda/VisePanda'
explore=(app/'Features/Explore/ExploreView.swift').read_text()
provider=explore[explore.index('enum NativePlaceProvider'):explore.index('private struct NativePlaceSearchReply')]
session=(app/'App/NativeSession.swift').read_text()
scope=session[session.index('struct NativeDataScope:'):session.index('private struct NativeDataFailure:')]
ask=(app/'Features/Ask/NativeAskModels.swift').read_text()
policy=ask[ask.index('struct NativeTextPolicy:'):ask.index('struct NativeTextTurn:')]
turn=ask[ask.index('struct NativeTextTurn:'):ask.index('struct NativeTextPolicyReply:')]
grounded=ask[ask.index('struct NativeGroundedResult:'):ask.index('/// VPJ-76 (#360) slice 9')]
knowledge=(app/'Features/Knowledge/NativeKnowledgeModels.swift').read_text()
accepted=ask[ask.index('struct NativeTextAccepted:'):ask.index('struct NativeTextAction:')]
submission=ask[ask.index('struct NativeTextSubmission:'):ask.index('enum NativeAskMode:')]
wire=(app/'Features/PlaceActions/NativePlaceActionWire.swift').read_text()
base=wire[wire.index('enum NativePlaceActionWire'):wire.index('struct NativePlaceActionContext')]
context=wire[wire.index('struct NativePlaceActionContext'):wire.index('    static func decode(_ bytes: Data, expected: NativePlaceActionSelection')]+ '\n}\n'
trip=(app/'Features/Trip/NativeTripModels.swift').read_text()
trip=trip[trip.index('struct NativeTripItem:'):trip.index('struct NativeTripContent:')]
# Scalar-only helpers, no session/auth/service substitutes. Actual wire calls these two scalars.
selected=(app/'Features/Ask/NativeSelectedMessageModels.swift').read_text().split('struct NativeSelectedMessageRequest:')[0]
support='''import Foundation
import CoreFoundation
enum NativeMemoryWire { static func uuid(_ value:String)->Bool { UUID(uuidString:value) != nil } }
enum NativeFiveResultContent { static func integer(_ raw:Any?, minimum:Int)->Int? { guard let n=raw as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite, n.doubleValue.rounded()==n.doubleValue, n.doubleValue>=Double(minimum), n.doubleValue<=2147483647 else { return nil }; return n.intValue } }
enum NativeTravelIntake { static func text(_ value:String,max:Int)->Bool { !value.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty && value.utf16.count<=max && !value.contains("\\0") } }
'''+provider+scope+policy+turn+grounded+knowledge+submission+trip+base+context+selected+accepted
with tempfile.TemporaryDirectory(prefix='ios003-canonical-unit-') as tmp:
    tmp=Path(tmp)
    (tmp/'Support.swift').write_text(support)
    files=[str(tmp/'Support.swift'),str(app/'Features/PlaceActions/NativePlaceActionIdentity.swift'),str(app/'Features/PlacePresentation/Canonical/NativeCanonicalPlaceAskCapture.swift'),str(app/'Features/PlacePresentation/Canonical/NativeCanonicalPlaceAskPending.swift'),str(Path(__file__).with_name('probe.swift'))]
    subprocess.run(['xcrun','swiftc','-parse-as-library','-swift-version','6',*files,'-o',str(tmp/'probe')],check=True)
    subprocess.run([str(tmp/'probe'),str(tmp/'request.json'),*(sys.argv[1:] or [str(Path(__file__).with_name('sql-wire-positive.json'))]),str(Path(__file__).with_name('sql-history-positive.json'))],check=True)
