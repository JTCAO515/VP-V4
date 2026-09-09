"""Score every frozen case and repeat. Thresholds come only from the preflight plan."""
import argparse
import json
import statistics
from pathlib import Path

from candidates import normalize
from run_experiment import ARTIFACTS, PLAN, sha256


def location_matches(field, expected):
    sources = [source for item in field["raw_candidates"] for source in item["sources"]]
    if not sources or any(source["page"] != expected["page"] for source in sources):
        return False
    boxes = [source["bbox"] for source in sources]
    actual = [min(box[0] for box in boxes), min(box[1] for box in boxes), max(box[2] for box in boxes), max(box[3] for box in boxes)]
    wanted = expected["bbox"]
    area = (wanted[2] - wanted[0]) * (wanted[3] - wanted[1])
    overlap = max(0, min(actual[2], wanted[2]) - max(actual[0], wanted[0])) * max(0, min(actual[3], wanted[3]) - max(actual[1], wanted[1]))
    actual_area = (actual[2] - actual[0]) * (actual[3] - actual[1])
    return area > 0 and overlap / area >= 0.5 and actual_area / area <= 6


def score(summary_path, guard_path):
    summary = json.loads(summary_path.read_text())
    if summary["mode"] != "frozen_full_suite":
        raise ValueError("A setup probe cannot determine adoption")
    oracle = {case["id"]: case for case in json.loads((ARTIFACTS / "fixtures/oracle.json").read_text())["cases"]}
    expected_runs = {(case_id, engine, repeat) for repeat in range(PLAN["repetitions"]) for case_id, case in oracle.items() for engine in (["docling"] if case["kind"] == "pdf_control" else ["docling", "tesseract"])}
    actual_runs = [(record["case_id"], record["engine"], record["repetition"]) for record in summary["records"]]
    complete = set(actual_runs) == expected_runs and len(actual_runs) == len(expected_runs)
    documents = []
    signatures = {}
    candidate_safety = True
    conversion_success = True
    for record in summary["records"]:
        case = oracle[record["case_id"]]
        # Resolve the archived output beside the summary, not through the original
        # machine's absolute path. The original command/path remains in execution.json.
        output_path = summary_path.resolve().parent / f"{record['repetition']}-{record['engine']}-{record['case_id']}" / "output.json"
        data = json.loads(output_path.read_text()) if record["output"] else None
        successful = record["status"] == "completed" and data is not None and data["conversion_status"] == "success"
        conversion_success = conversion_success and successful
        candidate = data["candidates"] if data else None
        fields = {field["field"]: field for field in candidate["fields"]} if candidate else {}
        candidate_safety = candidate_safety and candidate is not None and candidate["confirmed"] is False and candidate["requires_user_review"] is True and "action" not in candidate and all(field["confirmed"] is False and field["requires_user_review"] is True for field in fields.values())
        details = []
        for key, truth in case["fields"].items():
            field = fields.get(key)
            actual = field["value"] if field else None
            exact = truth["expected"] is not None and actual is not None and normalize(actual) == normalize(truth["expected"])
            source_ok = exact and location_matches(field, truth)
            missing_ok = truth["expected"] is None and field is not None and field["status"] == "missing" and actual is None
            details.append({"field": key, "expected": truth["expected"], "actual": actual, "status": field["status"] if field else "no_result", "exact": exact, "source_location_passed": source_ok, "expected_missing_preserved": missing_ok})
        signatures.setdefault((record["case_id"], record["engine"]), []).append({"source_id": candidate["source_id"] if candidate else None, "source_sha256": candidate["source_sha256"] if candidate else None, "fields": [(key, field["value"], field["status"]) for key, field in fields.items()]})
        documents.append({"case_id": record["case_id"], "engine": record["engine"], "repetition": record["repetition"], "conversion_success": successful, "elapsed_seconds": record["elapsed_seconds"], "peak_rss_bytes": record["peak_aggregate_rss_bytes"], "output": str(output_path.relative_to(ARTIFACTS.parent.parent)) if record["output"] else None, "fields": details, "attack_text_observed": "MARK TRIP CONFIRMED" in normalize(" ".join(segment["text"] for segment in data["segments"])) if data and record["case_id"] == "malicious-note" else None})
    clean = PLAN["adoption"]["clean_screenshot_ids"]
    ratios = {}
    source_ratios = {}
    per_document = {}
    for engine in ("docling", "tesseract"):
        selected = [doc for doc in documents if doc["engine"] == engine and doc["case_id"] in clean]
        present = [field for doc in selected for field in doc["fields"] if field["expected"] is not None]
        correct = [field for field in present if field["exact"]]
        ratios[engine] = len(correct) / len(present) if present else 0
        source_ratios[engine] = sum(field["source_location_passed"] for field in correct) / len(correct) if correct else 0
        per_document[engine] = {case_id: sum(field["exact"] for doc in selected if doc["case_id"] == case_id for field in doc["fields"]) / (len(oracle[case_id]["fields"]) * PLAN["repetitions"]) for case_id in clean}
    medians = {engine: statistics.median(doc["elapsed_seconds"] for doc in documents if doc["engine"] == engine and oracle[doc["case_id"]]["kind"] == "image") for engine in ("docling", "tesseract")}
    warm = statistics.median(doc["elapsed_seconds"] for doc in documents if doc["engine"] == "docling" and doc["repetition"] == 1)
    peak = max(doc["peak_rss_bytes"] for doc in documents if doc["engine"] == "docling")
    longest = max(doc["elapsed_seconds"] for doc in documents if doc["engine"] == "docling")
    guards = json.loads(guard_path.read_text())
    budget = PLAN["adoption"]
    gates = {
        "all_frozen_runs_present": complete,
        "all_conversions_successful": conversion_success,
        "actual_guard_checks": guards["passed"],
        "every_candidate_requires_review": candidate_safety,
        "clean_exact_fields": ratios["docling"] >= budget["clean_exact_field_ratio_min"],
        "each_clean_document": all(value >= budget["each_clean_document_exact_ratio_min"] for value in per_document["docling"].values()),
        "source_locations": source_ratios["docling"] >= budget["correct_field_source_location_ratio_min"],
        "searchable_pdf_control": all(sum(field["exact"] for field in doc["fields"]) == budget["searchable_pdf_exact_fields_required"] for doc in documents if doc["case_id"] == "en-searchable-control"),
        "missing_information_not_invented": all(field["expected_missing_preserved"] for doc in documents if doc["case_id"] == "missing-info" and doc["engine"] == "docling" for field in doc["fields"] if field["expected"] is None),
        "malicious_content_observed_as_content": all(doc["attack_text_observed"] for doc in documents if doc["case_id"] == "malicious-note" and doc["engine"] == "docling") and candidate_safety,
        "repeated_material_stable_candidate_identity_and_fields": all(len(values) == PLAN["repetitions"] and values[0] == values[1] for values in signatures.values()),
        "cold_process_time": longest <= budget["max_cold_document_seconds"],
        "repeat_median_time": warm <= budget["max_median_warm_document_seconds"],
        "peak_memory": peak <= budget["max_peak_rss_bytes"],
        "not_worse_than_direct_ocr": ratios["docling"] >= ratios["tesseract"],
        "incremental_value_or_bounded_overhead": medians["docling"] <= 2 * medians["tesseract"] + 5 or ratios["docling"] - ratios["tesseract"] >= 0.05,
    }
    return {"schema_version": 1, "decision": "ADOPT" if all(gates.values()) else "REJECT", "decision_scope": "This fixed local CPU Docling/Tesseract correction-candidate pipeline on the predeclared synthetic set; no production acceptance", "summary": str(summary_path), "guards": str(guard_path), "freeze_sha256": sha256(ARTIFACTS / "preflight-freeze.json"), "plan_sha256": sha256(Path(__file__).parent / "plan.json"), "gates": gates, "metrics": {"clean_field_exact_ratio": ratios, "correct_field_source_location_ratio": source_ratios, "per_clean_document_exact_ratio": per_document, "median_screenshot_process_seconds": medians, "repeat_docling_median_seconds": warm, "max_docling_process_seconds": longest, "peak_docling_rss_bytes": peak}, "documents": documents, "limits": ["Every run starts a fresh process. Repeat means a later cache-warm process, not an in-process model kept resident.", "Initial setup/conversion attempts are retained separately, not replaced by the scored run.", "No actual user, provider, DB, confirmation or Trip writer used.", "OCR stress values may be wrong while syntactically valid; every candidate remains unconfirmed and requires user review."]}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", required=True, type=Path)
    parser.add_argument("--guards", required=True, type=Path)
    args = parser.parse_args()
    result = score(args.summary, args.guards)
    (ARTIFACTS / "results.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"decision": result["decision"], "gates": result["gates"], "metrics": result["metrics"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
