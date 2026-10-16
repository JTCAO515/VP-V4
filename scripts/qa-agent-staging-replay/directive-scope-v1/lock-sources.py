"""Source-only candidate locks, never an authorization/START generator."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent
subprocess.run([sys.executable,str(ROOT/'container-diagnostic/restore/lock-sources.py')],check=True)
tree=ast.parse((HERE/'profile.py').read_text())
names=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PROFILE_FILES' for t in n.targets))
path=HERE/'source-lock.json';path.write_text(json.dumps({n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in names},indent=2,sort_keys=True)+'\n')
print(hashlib.sha256(path.read_bytes()).hexdigest())
