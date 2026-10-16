"""Actual cancellation consumer tests; synthetic ports, no app/simulator or external IO."""
from pathlib import Path
import subprocess,tempfile
ROOT=Path(__file__).resolve().parents[3]
scope=(ROOT/'ios/VisePanda/VisePanda/App/NativeSession.swift').read_text()
a=scope.index('struct NativeDataScope:');b=scope.index('\n}',a)+2
with tempfile.TemporaryDirectory(prefix='nativeqa-cancellation-tests-') as tmp:
 p=Path(tmp); src=p/'Sources/VisePanda';src.mkdir(parents=True);tests=p/'Tests/CancellationTests';tests.mkdir(parents=True)
 (p/'Package.swift').write_text('// swift-tools-version: 6.0\nimport PackageDescription\nlet package=Package(name:"NativeQACancellationProof",platforms:[.macOS(.v14)],products:[],targets:[.target(name:"VisePanda"),.testTarget(name:"CancellationTests",dependencies:["VisePanda"])])\n')
 (src/'NativeDataScope.swift').write_text('import Foundation\n'+scope[a:b]+'\n')
 for name in ['NativeQAContract.swift','NativeQAStore.swift','NativeQACancellationContract.swift','NativeQACancellationStore.swift']:
  (src/name).write_bytes((ROOT/'ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQA'/name).read_bytes())
 (tests/'NativeQACancellationConsumerTests.swift').write_bytes((ROOT/'ios/VisePanda/VisePandaTests/NativeQACancellationConsumerTests.swift').read_bytes())
 subprocess.run(['xcrun','swift','test','--package-path',str(p),'--scratch-path',str(p/'build')],check=True,cwd=ROOT)
