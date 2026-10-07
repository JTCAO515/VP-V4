#!/usr/bin/env python3
"""Inspect exact candidate bodies; apply only the explicitly leased pinned files."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = next(path for path in HERE.parents if (path / ".git").exists())

def sha(data):
    return hashlib.sha256(data).hexdigest()

def project(before, patch):
    original = before.decode().splitlines(keepends=True)
    lines = patch.decode().splitlines(keepends=True)
    output = []
    cursor = 0
    index = 2
    while index < len(lines):
        header = re.fullmatch(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n", lines[index])
        if not header:
            raise RuntimeError("Invalid zero-context hunk")
        start = int(header[1]); count = int(header[2] or "1")
        target = start if count == 0 else start - 1
        if target < cursor:
            raise RuntimeError("Overlapping candidate hunks")
        output.extend(original[cursor:target]); index += 1
        removed = []; added = []
        while index < len(lines) and not lines[index].startswith("@@ "):
            line = lines[index]; index += 1
            if line.startswith("-"): removed.append(line[1:])
            elif line.startswith("+"): added.append(line[1:])
            else: raise RuntimeError("Candidate is not zero-context")
        if len(removed) != count or original[target:target + count] != removed:
            raise RuntimeError("Exact source lines differ")
        if len(added) != int(header[4] or "1"):
            raise RuntimeError("Incorrect candidate count")
        output.extend(added); cursor = target + count
    output.extend(original[cursor:])
    return "".join(output).encode()

parser = argparse.ArgumentParser()
parser.add_argument("--inspect-directory", type=Path)
parser.add_argument("--apply", action="store_true")
parser.add_argument("--lease-batch-sha", help="Main-approved exact batch SHA; does not itself grant authority")
parser.add_argument("--file", action="append", default=[])
args = parser.parse_args()
pins = json.loads((HERE / "pins.json").read_text())
manifest = []
prepared = {}
already_applied = set()
for relative, pin in pins.items():
    patch = HERE / (Path(relative).name + ".patch")
    raw = patch.read_bytes()
    before = (ROOT / relative).read_bytes()
    current_sha = sha(before)
    if current_sha == pin["after"]:
        after = before; already_applied.add(relative)
    elif current_sha == pin["before"]:
        after = project(before, raw)
    else:
        raise RuntimeError("Baseline SHA differs: " + relative)
    if sha(after) != pin["after"]:
        raise RuntimeError("After SHA differs: " + relative)
    manifest.append({"file": relative, **pin, "patchSHA256": sha(raw)})
    prepared[relative] = after
batch = sha(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode())
print(json.dumps({"batchSHA256": batch, "files": manifest}, indent=2))
if args.inspect_directory:
    args.inspect_directory.mkdir(parents=True, exist_ok=True)
    for relative, after in prepared.items():
        (args.inspect_directory / (Path(relative).name + ".after.txt")).write_bytes(after)
if args.apply:
    if args.lease_batch_sha != batch or not args.file or not set(args.file).issubset(prepared):
        raise RuntimeError("Exact batch and explicitly leased file list required")
    pending = [relative for relative in args.file if relative not in already_applied]
    if not pending:
        print("All selected leased files already match their exact after SHA256 values.")
        raise SystemExit(0)
    selected = [str(HERE / (Path(relative).name + ".patch")) for relative in pending]
    subprocess.run(["git", "apply", "--unidiff-zero", "--check", *selected], cwd=ROOT, check=True)
    # Recheck every selected full baseline immediately before one git apply; no file-copy overwrite.
    for relative in pending:
        if sha((ROOT / relative).read_bytes()) != pins[relative]["before"]:
            raise RuntimeError("Source changed before application: " + relative)
    subprocess.run(["git", "apply", "--unidiff-zero", *selected], cwd=ROOT, check=True)
    for relative in args.file:
        if sha((ROOT / relative).read_bytes()) != pins[relative]["after"]:
            raise RuntimeError("Applied source differs: " + relative)
    print("Applied exact leased files; all after SHA256 values match.")
