"""Closed correction candidates from parser text/provenance; never a confirmation API."""
import re
import unicodedata
import math
from datetime import datetime
from decimal import Decimal, InvalidOperation

LABELS = {
    "service_id": ["Service", "车次"],
    "origin": ["Origin", "出发站"],
    "destination": ["Destination", "到达站"],
    "departure_local": ["Departure", "出发"],
    "arrival_local": ["Arrival", "到达"],
    "timezone": ["Time zone", "时区"],
    "currency": ["Currency", "币种"],
    "amount": ["Amount", "金额"],
}
BY_LABEL = {label.casefold(): key for key, labels in LABELS.items() for label in labels}
LABEL_PATTERN = re.compile(r"^(" + "|".join(re.escape(label) for label in sorted(BY_LABEL, key=len, reverse=True)) + r")\s*[:：]\s*(.*)$", re.IGNORECASE)


def normalize(text):
    text = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text)).strip()
    return re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", text)


def parse_value(key, text):
    value = normalize(text)
    if key in {"departure_local", "arrival_local"}:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d %H:%M")
            return value if parsed.strftime("%Y-%m-%d %H:%M") == value else None
        except ValueError:
            return None
    if key == "timezone":
        match = re.fullmatch(r"([A-Za-z_]+/[A-Za-z_]+)\s+UTC([+-])(\d{2}):(\d{2})", value)
        return value if match and int(match[3]) <= 14 and int(match[4]) < 60 else None
    if key == "amount":
        try:
            return format(Decimal(value), ".2f") if re.fullmatch(r"\d{1,8}\.\d{2}", value) else None
        except InvalidOperation:
            return None
    if key == "currency":
        return value if re.fullmatch(r"[A-Z]{3}", value) else None
    if key == "service_id":
        return value if re.fullmatch(r"[A-Z]{1,3}\d{1,4}", value) else None
    return value if 0 < len(value) <= 120 else None


def valid_source(source):
    if not isinstance(source, dict) or type(source.get("page")) is not int or source["page"] != 1:
        return False
    box = source.get("bbox")
    return isinstance(box, list) and len(box) == 4 and all(type(n) in (float, int) and math.isfinite(n) for n in box) and 0 <= box[0] < box[2] <= 1 and 0 <= box[1] < box[3] <= 1


def group_cells_into_lines(cells):
    """Preserve real OCR cell references while grouping horizontally aligned words."""
    lines = []
    for cell in sorted(cells, key=lambda cell: (cell["source"]["page"], cell["source"]["bbox"][1], cell["source"]["bbox"][0])):
        box = cell["source"]["bbox"]
        center = (box[1] + box[3]) / 2
        matching = next((line for line in reversed(lines) if line[0]["source"]["page"] == cell["source"]["page"] and abs((line[0]["source"]["bbox"][1] + line[0]["source"]["bbox"][3]) / 2 - center) <= min(line[0]["source"]["bbox"][3] - line[0]["source"]["bbox"][1], box[3] - box[1]) * 0.6), None)
        if matching is None:
            lines.append([cell])
        else:
            matching.append(cell)
    segments = []
    for line in lines:
        line.sort(key=lambda cell: cell["source"]["bbox"][0])
        boxes = [cell["source"]["bbox"] for cell in line]
        segments.append({"text": " ".join(cell["text"] for cell in line), "source": {"page": line[0]["source"]["page"], "bbox": [min(box[0] for box in boxes), min(box[1] for box in boxes), max(box[2] for box in boxes), max(box[3] for box in boxes)], "parser_ref": [cell["source"]["parser_ref"] for cell in line]}})
    return segments


def extract_candidates(segments, source_id, source_sha256):
    found = {key: [] for key in LABELS}
    previous = None
    for segment in segments:
        for line in segment["text"].splitlines():
            text = normalize(line)
            match = LABEL_PATTERN.fullmatch(text)
            if match:
                key = BY_LABEL[match[1].casefold()]
                item = {"raw_text": match[2], "sources": [segment["source"]]}
                found[key].append(item)
                previous = (key, item)
            elif previous and previous[0] in {"origin", "destination"} and re.search(r"[\u3400-\u9fff]", text) and len(text) <= 30:
                # A short bilingual continuation is kept with its actual second source box.
                previous[1]["raw_text"] += " " + text
                previous[1]["sources"].append(segment["source"])
            else:
                previous = None
    fields = []
    for key, items in found.items():
        value = parse_value(key, items[0]["raw_text"]) if len(items) == 1 else None
        sources = [source for item in items for source in item["sources"]]
        status = "missing" if not items else "ambiguous" if len(items) > 1 else "invalid_text" if value is None else "source_missing" if not all(valid_source(source) for source in sources) else "candidate"
        fields.append({"field": key, "value": value if status == "candidate" else None, "status": status, "raw_candidates": items, "requires_user_review": True, "confirmed": False})
    return {"schema_version": 1, "kind": "material_correction_candidates", "source_id": source_id, "source_sha256": source_sha256, "incomplete": any(field["status"] != "candidate" for field in fields), "requires_user_review": True, "confirmed": False, "fields": fields}
