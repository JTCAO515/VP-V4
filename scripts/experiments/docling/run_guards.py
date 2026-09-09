"""Actual invalid-input, cancellation, timeout and memory-bound checks on owned fixtures."""
import argparse
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
import pypdfium2 as pdfium

from run_experiment import ARTIFACTS, LIMITS, check_network_denial, run_one, validate_input, verify_frozen_inputs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", type=Path, required=True)
    args = parser.parse_args()
    verify_frozen_inputs(args.assets)
    output = ARTIFACTS / "guards" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    output.mkdir(parents=True)
    check_network_denial(output, args.assets)
    cases = []
    # These are deterministic mutations for admission checks, not added accuracy samples.
    with tempfile.TemporaryDirectory(prefix="vpj73-input-guards-") as temporary:
        root = Path(temporary)
        invalid = root / "oversized.png"
        invalid.write_bytes(b"x" * (LIMITS["file_bytes"] + 1))
        pixels = root / "pixels.png"
        Image.new("RGB", (2001, 1000), "white").save(pixels)
        text = root / "unsupported.txt"
        text.write_text("Synthetic unsupported input")
        alias = root / "alias.png"
        alias.symlink_to(ARTIFACTS / "fixtures/en-clear.png")
        multi = root / "two-pages.pdf"
        with pdfium.PdfDocument.new() as document:
            document.new_page(500, 700).close()
            document.new_page(500, 700).close()
            document.save(multi)
        for path, expected in [(invalid, "file_limit"), (pixels, "pixel_limit"), (text, "format_not_allowed"), (alias, "regular_local_file_required"), (multi, "page_limit")]:
            try:
                validate_input(path)
                actual = "unexpectedly_admitted"
            except ValueError as error:
                actual = str(error)
            cases.append({"check": expected, "actual": actual, "passed": actual == expected, "conversion_launched": False})
    source = ARTIFACTS / "fixtures/en-clear.png"
    for name, kwargs, expected in [
        ("cancel-active-conversion", {"cancel_after_started": 0.2}, "cancelled"),
        ("timeout-active-conversion", {"timeout_after_started": 0.2}, "timeout"),
        ("memory-bound", {"rss_bytes": 64 * 1024 * 1024}, "memory_limit"),
    ]:
        result = run_one(source, "docling", args.assets, output / name, **kwargs)
        passed = result["status"] == expected and result["output"] is None
        if expected != "memory_limit":
            passed = passed and result["conversion_started_observed"]
        cases.append({"check": name, "actual": result["status"], "passed": passed, "execution": result})
        print(json.dumps({"check": name, "passed": passed, "status": result["status"]}), flush=True)
    report = {"kind": "actual_process_guard_checks", "cases": cases, "passed": all(case["passed"] for case in cases), "network_denial": str(output / "network-denial.json"), "limitation": "RSS is aggregate sampled every 50ms; the supervisor kills the process group after observing excess, not an instantaneous kernel RSS allocation cap."}
    (output / "results.json").write_text(json.dumps(report, indent=2) + "\n")
    print(str(output / "results.json"))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
