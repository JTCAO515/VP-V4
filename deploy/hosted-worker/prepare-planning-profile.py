"""Create a private, nonsecret offline package; never authorize/start a target."""
import json
import os
from pathlib import Path
import subprocess
import sys


def closed_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


try:
    if len(sys.argv) != 7 or sys.argv[1] != "--profile" or sys.argv[3] != "--target" or sys.argv[5] != "--out":
        raise ValueError("arguments")
    sources = [Path(sys.argv[2]), Path(sys.argv[4])]
    for source, limit in zip(sources, (16384, 4096)):
        if source.is_symlink() or not source.is_file() or not 2 <= source.stat().st_size <= limit:
            raise ValueError("input")
    values = [json.loads(source.read_text(encoding="utf-8"), object_pairs_hook=closed_pairs) for source in sources]
    checker = Path(__file__).with_name("validate-planning-profile.mjs")
    checked = subprocess.run(["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", str(checker), "--prepare"],
                             input=json.dumps(dict(zip(("profile", "target"), values))), capture_output=True, text=True, timeout=20)
    if checked.returncode != 0:
        raise ValueError("profile")
    payload = json.loads(checked.stdout)
    output = Path(sys.argv[6])
    # mkdir refuses any existing path, including a symlink. No overwrite or
    # copy of the source bytes: only validated canonical metadata is written.
    output.mkdir(mode=0o700)
    for name, value in (("hosted-profile.json", payload["profileJson"]), ("planning-target.json", payload["targetJson"])):
        descriptor = os.open(output / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as destination:
            destination.write(value)
    print("Planning package prepared offline; target activation is not authorized.")
except (OSError, UnicodeError, ValueError, TypeError, KeyError, subprocess.SubprocessError):
    print("Planning package unavailable.", file=sys.stderr)
    sys.exit(1)
