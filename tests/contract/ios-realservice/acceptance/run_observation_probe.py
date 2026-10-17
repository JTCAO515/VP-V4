from pathlib import Path
import subprocess,tempfile
ROOT=Path(__file__).resolve().parents[4]
HERE=Path(__file__).resolve().parent
session=(ROOT/'ios/VisePanda/VisePanda/App/NativeSession.swift').read_text()
a=session.index('struct NativeDataScope:');b=session.index('\n}',a)+2
with tempfile.TemporaryDirectory(prefix='nativeqa-observation-') as tmp:
 p=Path(tmp); scope=p/'Scope.swift';scope.write_text('import Foundation\n'+session[a:b]+'\n')
 names=['NativeQAContract.swift','NativeQACancellationContract.swift','Acceptance/NativeQAAcceptanceObservation.swift']
 sources=[str(ROOT/'ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQA'/n) for n in names]
 subprocess.run(['/usr/bin/xcrun','swiftc','-swift-version','6','-parse-as-library','-D','NATIVE_QA_ACCEPTANCE','-module-cache-path',str(p/'cache'),str(scope),*sources,str(HERE/'ObservationProbe.swift'),'-o',str(p/'probe')],check=True)
 subprocess.run([str(p/'probe')],check=True)
 sdk=subprocess.check_output(['/usr/bin/xcrun','--sdk','iphoneos','--show-sdk-path'],text=True).strip()
 subprocess.run(['/usr/bin/xcrun','swiftc','-typecheck','-swift-version','6','-D','NATIVE_QA_ACCEPTANCE','-sdk',sdk,'-target','arm64-apple-ios17.0','-module-cache-path',str(p/'ios-cache'),str(scope),*sources],check=True)
print('PASS: opt-in observation source iOS17 Swift6 typecheck; no App hook applied')
