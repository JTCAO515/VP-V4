from pathlib import Path
import subprocess
import sys

root = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
subprocess.run([sys.executable, str(root / 'artifacts/VPJ-29/native-local-recovery-20261004/prepare_harness.py'), str(root), str(output)], check=True)
for source in (root / 'ios/VisePanda/VisePanda/Features/TrafficObservation').glob('*.swift'):
    link = output / 'Sources/VisePanda' / source.name
    if link.is_symlink():
        link.unlink()
    link.symlink_to(source)
