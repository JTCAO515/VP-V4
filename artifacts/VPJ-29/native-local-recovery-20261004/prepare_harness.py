from pathlib import Path
import sys, shutil, subprocess
root=Path(sys.argv[1]).resolve()
output=Path(sys.argv[2]).resolve()
assets=Path(__file__).resolve().parent
(output/'Sources/VisePanda').mkdir(parents=True,exist_ok=True)
(output/'Tests/VisePandaTests').mkdir(parents=True,exist_ok=True)
shutil.copyfile(assets/'Package.swift',output/'Package.swift')
shutil.copyfile(assets/'Support.swift',output/'Sources/VisePanda/Support.swift')
files=list((root/'ios/VisePanda/VisePanda/Features/Recovery').glob('*.swift'))+[root/'ios/VisePanda/VisePanda/Features/Trip/NativeTripModels.swift']
for source in files:
    if source.name=='NativeRecoveryView.swift': continue
    link=output/'Sources/VisePanda'/source.name
    if link.is_symlink(): link.unlink()
    link.symlink_to(source)
link=output/'Tests/VisePandaTests/NativeRecoveryTests.swift'
if link.is_symlink():link.unlink()
link.symlink_to(root/'ios/VisePanda/VisePandaTests/NativeRecoveryTests.swift')
subprocess.run([sys.executable,str(assets/'project_session.py'),str(root),str(output)],check=True)
