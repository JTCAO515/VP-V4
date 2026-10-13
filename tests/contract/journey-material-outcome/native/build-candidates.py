from pathlib import Path
import tempfile, shutil, subprocess, json, hashlib
root=Path(__file__).resolve().parents[4]
art=root/'artifacts/VPJ-13/material-outcome-native-20261013'
pins=json.loads((art/'shared-candidates/pins.json').read_text())
sources={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'ios/VisePanda/VisePanda/Features/JourneyMaterialOutcome').glob('*.swift')}
with tempfile.TemporaryDirectory(prefix='vpj13-material-native-build-') as directory:
    temp=Path(directory)
    shutil.copytree(root/'ios',temp/'ios')
    for pin in pins['pins']:
        path=pin['path']; shutil.copyfile(art/'shared-candidates'/f'{path}.after',temp/path)
    command=['xcodebuild','build','-project',str(temp/'ios/VisePanda/VisePanda.xcodeproj'),'-scheme','VisePanda','-destination','generic/platform=iOS Simulator','-derivedDataPath',str(temp/'DerivedData'),'CODE_SIGNING_ALLOWED=NO','CODE_SIGNING_REQUIRED=NO']
    with (art/'candidate-build.log').open('w') as stream:
        result=subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT)
    (art/'candidate-build.json').write_text(json.dumps({'result':'PASS' if result.returncode==0 else 'FAIL','sourceSHA256':sources,'sharedCandidates':pins,'command':command,'simulatorBooted':False,'sharedApplied':False},indent=2)+'\n')
    print('CANDIDATE_GENERIC_IOS_BUILD', 'PASS' if result.returncode==0 else 'FAIL', 'exit',result.returncode,flush=True)
    if result.returncode:
        for line in (art/'candidate-build.log').read_text().splitlines():
            if 'error:' in line or '** BUILD' in line: print(line)
    raise SystemExit(result.returncode)
