"""Run real new consumer sources/tests with synthetic transport, outside app/simulator."""
from pathlib import Path
import subprocess,tempfile
ROOT=Path(__file__).resolve().parents[3]
scope=(ROOT/'ios/VisePanda/VisePanda/App/NativeSession.swift').read_text()
a=scope.index('struct NativeDataScope:'); b=scope.index('\n}',a)+2
with tempfile.TemporaryDirectory(prefix='nativeqa-tests-') as tmp:
 p=Path(tmp); src=p/'Sources/VisePanda'; src.mkdir(parents=True); tests=p/'Tests/ConsumerTests'; tests.mkdir(parents=True)
 (p/'Package.swift').write_text('// swift-tools-version: 6.0\nimport PackageDescription\nlet package = Package(name:"NativeQAConsumerProof", platforms:[.macOS(.v14)], products:[], targets:[.target(name:"VisePanda"), .testTarget(name:"ConsumerTests",dependencies:["VisePanda"])])\n')
 (src/'NativeDataScope.swift').write_text('import Foundation\n'+scope[a:b]+'\n')
 for name in ['NativeQAContract.swift','NativeQAStore.swift','NativeQAWorkPresentation.swift']:
  (src/name).write_bytes((ROOT/'ios/VisePanda/VisePanda/Features/RealServiceEntry/NativeQA'/name).read_bytes())
 (tests/'NativeQAConsumerTests.swift').write_bytes((ROOT/'ios/VisePanda/VisePandaTests/NativeQAConsumerTests.swift').read_bytes())
 subprocess.run(['xcrun','swift','test','--package-path',str(p),'--scratch-path',str(p/'build')],check=True,cwd=ROOT)
