"""Rebuild a disposable fixed-124 dependency tree, or remove only that tree."""
import io
import pathlib
import shutil
import subprocess
import sys
import tarfile
root = pathlib.Path(__file__).resolve().parent
repo = root.parents[3]
target = root / 'validation-root'
if '--clean' in sys.argv:
    if target.exists():
        shutil.rmtree(target)
    sys.exit(0)
if target.exists():
    raise SystemExit('Remove the prior disposable validation tree first with --clean')
target.mkdir()
raw = subprocess.check_output(['git', 'archive', '124da5cf138c72ae4b7ae4f1116f1fad4f416ec0', 'lib/server', 'package.json'], cwd=repo)
with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
    for member in archive.getmembers():
        if member.name.startswith('/') or '..' in pathlib.PurePosixPath(member.name).parts or member.issym() or member.islnk():
            raise SystemExit('Unexpected archive member')
    archive.extractall(target)
for name in ['contract.ts', 'export.ts', 'source-schema.json']:
    source = root / 'after' / (name + '.txt' if name.endswith('.ts') else name)
    shutil.copyfile(source, target / 'lib/server/privacy/turn-data' / name)
shutil.copytree(repo / 'lib/server/knowledge/place-ask', target / 'lib/server/knowledge/place-ask')
(target / 'node_modules').symlink_to(repo / 'node_modules', target_is_directory=True)
