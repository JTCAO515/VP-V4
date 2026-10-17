"""Source locks only; never fills pending evidence or activates an operator."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent
subprocess.run([sys.executable,str(ROOT/'directive-scope-v1/lock-sources.py')],check=True)
tree=ast.parse((HERE/'profile.py').read_text())
names=next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='PROFILE_FILES' for t in n.targets))
(HERE/'source-lock.json').write_text(json.dumps({name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in names},indent=2,sort_keys=True)+'\n')
