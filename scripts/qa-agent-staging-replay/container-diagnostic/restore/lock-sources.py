"""Prepare a candidate source lock; never grants operator/window authority."""
import ast
import hashlib
import json
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parent.parent
module=ast.parse((HERE/'bridge.py').read_text())
names=next(ast.literal_eval(node.value) for node in module.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='SOURCE_FILES' for t in node.targets))
lock={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in names}
path=HERE/'source-lock.json';path.write_text(json.dumps(lock,indent=2,sort_keys=True)+'\n')
print(hashlib.sha256(path.read_bytes()).hexdigest())
