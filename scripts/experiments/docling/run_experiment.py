"""Bounded macOS offline runner for the frozen VPJ-73 experiment, not a product API."""
import argparse
import hashlib
import importlib.metadata
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent
ARTIFACTS = ROOT / "artifacts/VPJ-73"
PLAN = json.loads((HERE / "plan.json").read_text())
LIMITS = PLAN["limits"]
SANDBOX = "/usr/bin/sandbox-exec"
PROFILE = "(version 1)(allow default)(deny network*)"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate_input(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file():
        raise ValueError("regular_local_file_required")
    if path.stat().st_size > LIMITS["file_bytes"]:
        raise ValueError("file_limit")
    if path.suffix.lower() == ".png":
        with Image.open(path) as image:
            if image.format != "PNG":
                raise ValueError("format_mismatch")
            if image.width * image.height > LIMITS["image_pixels"]:
                raise ValueError("pixel_limit")
            image.verify()
    elif path.suffix.lower() == ".pdf":
        import pypdfium2 as pdfium
        with pdfium.PdfDocument(path) as document:
            if len(document) != LIMITS["pdf_pages"]:
                raise ValueError("page_limit")
    else:
        raise ValueError("format_not_allowed")
    return sha256(path)


def verify_frozen_inputs(assets):
    freeze = json.loads((ARTIFACTS / "preflight-freeze.json").read_text())
    for filename, expected in freeze["files"].items():
        if sha256(ROOT / filename) != expected:
            raise ValueError("frozen_input_changed: " + filename)
    for case in json.loads((ARTIFACTS / "fixtures/oracle.json").read_text())["cases"]:
        if validate_input(ARTIFACTS / "fixtures" / case["file"]) != case["sha256"]:
            raise ValueError("fixture_bytes_changed")
    for asset in json.loads((ARTIFACTS / "downloaded-assets.json").read_text()):
        relative = Path(asset["path"]).relative_to(Path(asset["path"]).parents[1])
        # Download records have a category/file pair; the font/weight bytes stay fixed.
        if sha256(assets / relative) != asset["sha256"]:
            raise ValueError("asset_bytes_changed: " + str(relative))
    supplement = json.loads((ARTIFACTS / "tesseract-config-supplement.json").read_text())
    if sha256(assets / "tessdata/configs/tsv") != supplement["sha256"]:
        raise ValueError("tesseract_config_changed")
    for component in json.loads((ARTIFACTS / "installed-components.json").read_text()):
        if importlib.metadata.version(component["package"]) != component["version"]:
            raise ValueError("installed_component_changed")
    if sha256(freeze["tesseract_binary"]["path"]) != freeze["tesseract_binary"]["sha256"]:
        raise ValueError("tesseract_binary_changed")


def offline_environment(directory, assets):
    for name in ("tmp", "hf", "cache"):
        (directory / name).mkdir(parents=True, exist_ok=True)
    return {
        "PATH": str(Path(sys.executable).parent) + ":/usr/bin:/bin",
        "LANG": "en_US.UTF-8", "PYTHONHASHSEED": "0", "PYTHONDONTWRITEBYTECODE": "1",
        "HF_HOME": str(directory / "hf"), "HF_HUB_OFFLINE": "1", "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1", "TRANSFORMERS_OFFLINE": "1", "TOKENIZERS_PARALLELISM": "false",
        "XDG_CACHE_HOME": str(directory / "cache"), "TMPDIR": str(directory / "tmp"),
        "TESSDATA_PREFIX": str(assets / "tessdata"), "DOCLING_ARTIFACTS_PATH": str(assets),
        "OMP_NUM_THREADS": "2", "OPENBLAS_NUM_THREADS": "2", "MKL_NUM_THREADS": "2",
    }


def check_network_denial(directory, assets):
    code = "import socket,errno; s=socket.socket(); s.settimeout(1)\ntry:s.connect(('1.1.1.1',443))\nexcept PermissionError as e:\n assert e.errno==errno.EPERM;print('NETWORK_DENIED_EPERM')\nelse:raise RuntimeError('Network unexpectedly available')"
    command = [SANDBOX, "-p", PROFILE, sys.executable, "-c", code]
    result = subprocess.run(command, capture_output=True, text=True, env=offline_environment(directory, assets), timeout=5)
    evidence = {"command": command, "exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr}
    (directory / "network-denial.json").write_text(json.dumps(evidence, indent=2) + "\n")
    if result.returncode != 0 or "NETWORK_DENIED_EPERM" not in result.stdout:
        raise RuntimeError("Offline isolation is not established")


def run_one(path, engine, assets, directory, *, wall_seconds=None, rss_bytes=None, cancel_after_started=None):
    source_hash = validate_input(path)
    directory.mkdir(parents=True, exist_ok=False)
    output = directory / "output.json"
    command = [SANDBOX, "-p", PROFILE, sys.executable, str(HERE / "worker.py"), "--input", str(path.resolve()), "--assets", str(assets.resolve()), "--output", str(output), "--engine", engine]
    deadline = LIMITS["wall_seconds"] if wall_seconds is None else min(wall_seconds, LIMITS["wall_seconds"])
    memory_limit = LIMITS["rss_bytes"] if rss_bytes is None else min(rss_bytes, LIMITS["rss_bytes"])
    started_at = datetime.now(timezone.utc).isoformat()
    started = time.monotonic()
    peak = 0
    stop_reason = None
    marker_at = None
    with (directory / "worker.log").open("w") as log:
        process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, env=offline_environment(directory, assets), start_new_session=True)
        observed = psutil.Process(process.pid)
        while process.poll() is None:
            now = time.monotonic()
            try:
                rss = sum(child.memory_info().rss for child in [observed, *observed.children(recursive=True)])
                peak = max(peak, rss)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
            if output.with_suffix(".started").exists() and marker_at is None:
                marker_at = now
            if peak > memory_limit:
                stop_reason = "memory_limit"
            elif now - started > deadline:
                stop_reason = "timeout"
            elif cancel_after_started is not None and marker_at is not None and now - marker_at >= cancel_after_started:
                stop_reason = "cancelled"
            if stop_reason:
                os.killpg(process.pid, signal.SIGKILL)
                break
            time.sleep(LIMITS["resource_poll_seconds"])
        exit_code = process.wait(timeout=5)
    status = stop_reason or ("completed" if exit_code == 0 and output.is_file() else "conversion_failed")
    if status != "completed":
        output.unlink(missing_ok=True)
        output.with_suffix(".partial").unlink(missing_ok=True)
    elif output.stat().st_size > LIMITS["output_bytes"]:
        output.unlink()
        status = "output_limit"
    record = {"engine": engine, "input": path.name, "source_sha256": source_hash, "status": status, "exit_code": exit_code, "elapsed_seconds": time.monotonic() - started, "peak_aggregate_rss_bytes": peak, "rss_poll_seconds": LIMITS["resource_poll_seconds"], "conversion_started_observed": marker_at is not None, "output": str(output) if output.exists() else None, "command": command, "started_at": started_at, "network": "OS sandbox deny network*; empty isolated HF cache; no credentials passed"}
    (directory / "execution.json").write_text(json.dumps(record, indent=2) + "\n")
    with (ARTIFACTS / "commands.jsonl").open("a") as log:
        log.write(json.dumps(record) + "\n")
    return record


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=Path, required=True)
    parser.add_argument("--only", help="Setup probe on one already frozen case; not a scored subset")
    parser.add_argument("--engine", choices=["docling", "tesseract", "both"], default="both")
    args = parser.parse_args()
    verify_frozen_inputs(args.assets)
    run = ARTIFACTS / "runs" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run.mkdir(parents=True)
    check_network_denial(run, args.assets)
    oracle = json.loads((ARTIFACTS / "fixtures/oracle.json").read_text())
    records = []
    for repetition in range(1 if args.only else PLAN["repetitions"]):
        for case in oracle["cases"]:
            if args.only and case["id"] != args.only:
                continue
            engines = ["docling", "tesseract"] if args.engine == "both" else [args.engine]
            for engine in engines:
                if case["kind"] == "pdf_control" and engine == "tesseract":
                    continue
                record = run_one(ARTIFACTS / "fixtures" / case["file"], engine, args.assets, run / f"{repetition}-{engine}-{case['id']}")
                record.update(case_id=case["id"], repetition=repetition)
                records.append(record)
                print(json.dumps({"run": str(run), "case": case["id"], "engine": engine, "status": record["status"], "seconds": round(record["elapsed_seconds"], 2)}), flush=True)
    (run / "summary.json").write_text(json.dumps({"mode": "setup_probe" if args.only else "frozen_full_suite", "freeze_sha256": sha256(ARTIFACTS / "preflight-freeze.json"), "records": records}, indent=2) + "\n")
    print(str(run / "summary.json"))
    if not records or any(record["status"] != "completed" for record in records):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
