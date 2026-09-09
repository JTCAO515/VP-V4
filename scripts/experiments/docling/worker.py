"""One offline conversion process. The caller bounds and cancels this process group."""
import argparse
import csv
import hashlib
import io
import json
import subprocess
import time
from pathlib import Path

from candidates import extract_candidates, group_cells_into_lines

TESSERACT = "/opt/homebrew/Cellar/tesseract/5.5.3/bin/tesseract"


def tesseract_segments(path, assets, marker):
    from PIL import Image
    with Image.open(path) as image:
        width, height = image.size
    command = [TESSERACT, "--tessdata-dir", str(assets / "tessdata"), "-l", "eng+chi_sim", "--psm", "3", str(path), "stdout", "tsv"]
    marker.write_text("ocr-process-invocation-started\n")
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    lines = {}
    for row in csv.DictReader(io.StringIO(result.stdout), delimiter="\t", quoting=csv.QUOTE_NONE):
        if not row["text"].strip():
            continue
        key = (row["block_num"], row["par_num"], row["line_num"])
        x, y, w, h = (int(row[k]) for k in ("left", "top", "width", "height"))
        entry = lines.setdefault(key, {"words": [], "bbox": [x, y, x + w, y + h]})
        entry["words"].append(row["text"])
        box = entry["bbox"]
        entry["bbox"] = [min(box[0], x), min(box[1], y), max(box[2], x + w), max(box[3], y + h)]
    segments = [{"text": " ".join(item["words"]), "source": {"page": 1, "bbox": [item["bbox"][0] / width, item["bbox"][1] / height, item["bbox"][2] / width, item["bbox"][3] / height], "parser_ref": "tsv-line-" + "-".join(key)}} for key, item in lines.items()]
    return segments, {"format": "tesseract-tsv", "text": result.stdout}, "success"


def docling_segments(path, assets, marker):
    from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import LayoutObjectDetectionOptions, PdfPipelineOptions, TesseractCliOcrOptions
    from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption
    layout = LayoutObjectDetectionOptions.from_preset("layout_heron_default")
    layout.model_spec.revision = "8f39ad3c0b4c58e9c2d2c84a38465abf757272d8"
    options = PdfPipelineOptions(
        artifacts_path=assets,
        enable_remote_services=False,
        allow_external_plugins=False,
        do_table_structure=False,
        do_picture_classification=False,
        do_picture_description=False,
        do_code_enrichment=False,
        do_formula_enrichment=False,
        do_chart_extraction=False,
        do_ocr=True,
        generate_parsed_pages=True,
        document_timeout=110,
        images_scale=2,
        layout_options=layout,
        accelerator_options=AcceleratorOptions(device=AcceleratorDevice.CPU, num_threads=2),
        ocr_options=TesseractCliOcrOptions(lang=["eng", "chi_sim"], tesseract_cmd=TESSERACT, path=str(assets / "tessdata"), psm=3, force_full_page_ocr=path.suffix.lower() == ".png"),
    )
    converter = DocumentConverter(allowed_formats=[InputFormat.PDF, InputFormat.IMAGE], format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options), InputFormat.IMAGE: ImageFormatOption(pipeline_options=options)})
    marker.write_text("docling-convert-invocation-started\n")
    result = converter.convert(path, max_num_pages=1, max_file_size=2097152, raises_on_error=False)
    document = result.document.export_to_dict()
    cells = []
    for page in result.pages:
        width, height = page.size.width, page.size.height
        for cell in page.cells:
            box = cell.rect.to_bounding_box().to_top_left_origin(page_height=height)
            cells.append({"text": cell.text, "source": {"page": page.page_no, "bbox": [box.l / width, box.t / height, box.r / width, box.b / height], "parser_ref": f"page-{page.page_no}-cell-{cell.index}"}, "from_ocr": cell.from_ocr, "parser_confidence": cell.confidence})
    # Metadata retention does not change layout/OCR inference. High-level DocItems may
    # merge many field rows; using them alone discards the parser's actual locations.
    return group_cells_into_lines(cells), {"docling_document": document, "page_cells": cells, "pipeline_options": options.model_dump(mode="json")}, result.status.value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--assets", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--engine", choices=["docling", "tesseract"], required=True)
    args = parser.parse_args()
    source_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
    started = time.monotonic()
    segments, document, status = (docling_segments if args.engine == "docling" else tesseract_segments)(args.input, args.assets, args.output.with_suffix(".started"))
    candidates = extract_candidates(segments, "synthetic-" + source_hash[:16], source_hash)
    candidates["incomplete"] = candidates["incomplete"] or status != "success"
    output = {"adapter_revision": 2, "engine": args.engine, "conversion_status": status, "conversion_seconds": time.monotonic() - started, "segments": segments, "document": document, "candidates": candidates}
    encoded = json.dumps(output, ensure_ascii=False, indent=2).encode()
    if len(encoded) > 8388608:
        raise ValueError("Output exceeds frozen limit")
    temporary = args.output.with_suffix(".partial")
    temporary.write_bytes(encoded)
    temporary.replace(args.output)


if __name__ == "__main__":
    main()
