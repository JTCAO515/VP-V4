"""Author deterministic synthetic screenshots and one searchable PDF before evaluation."""
import hashlib
import io
import json
import re
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).parent
LABELS = {
    "en": ["Service", "Origin", "Destination", "Departure", "Arrival", "Time zone", "Currency", "Amount"],
    "zh": ["车次", "出发站", "到达站", "出发", "到达", "时区", "币种", "金额"],
}
KEYS = ["service_id", "origin", "destination", "departure_local", "arrival_local", "timezone", "currency", "amount"]


def normal(value):
    return re.sub(r"\s+", " ", value).strip()


def main():
    font_path = Path(sys.argv[1])
    spec = json.loads((HERE / "fixtures.json").read_text())
    output = ROOT / "artifacts/VPJ-73/fixtures"
    output.mkdir(parents=True, exist_ok=True)
    width, height = spec["width"], spec["height"]
    oracle = []

    def font(size):
        result = ImageFont.truetype(str(font_path), size)
        result.set_variation_by_axes([400])
        return result

    for case in spec["cases"]:
        image = Image.new("RGB", (width, height), "#f8f6f2")
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((30, 30, width - 30, height - 30), radius=25, fill="white", outline="#d0cad0", width=2)
        draw.text((60, 60), "SYNTHETIC TRAVEL MATERIAL", font=font(40), fill="#45223f")
        draw.text((60, 132), case["id"] + " / NOT A TICKET / 自有测试材料", font=font(22), fill="#555555")
        truth = {}
        for index, key in enumerate(KEYS):
            if key not in case["fields"]:
                truth[key] = {"expected": None, "bbox": None, "status": "missing"}
                continue
            label = LABELS[case["locale"]][index]
            value = case["fields"][key]
            text = label + ": " + value
            xy = (60, 215 + index * 105)
            bounds = draw.multiline_textbbox(xy, text, font=font(case["font_size"]), spacing=6)
            if bounds[2] > width - 40:
                raise ValueError(f"Fixture overflow: {case['id']} {key}")
            draw.multiline_text(xy, text, font=font(case["font_size"]), spacing=6, fill="#202020")
            truth[key] = {"expected": normal(value), "bbox": [bounds[0] / width, bounds[1] / height, bounds[2] / width, bounds[3] / height], "page": 1, "status": "present"}
        note = "\n".join(textwrap.fill(line, width=72) for line in case["note"].splitlines())
        draw.multiline_text((60, 1090), note, font=font(20), spacing=7, fill="#404040")
        draw.text((60, 1320), "For parser evaluation only. No purchase, booking or Trip is confirmed.", font=font(18), fill="#555555")
        if degradation := case.get("degradation"):
            small_width = degradation["resize_width"]
            image = image.resize((small_width, round(height * small_width / width)), Image.Resampling.LANCZOS)
            image = image.filter(ImageFilter.GaussianBlur(degradation["blur_radius"]))
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=degradation["jpeg_quality"])
            image = Image.open(io.BytesIO(buffer.getvalue())).convert("RGB").resize((width, height), Image.Resampling.BILINEAR)
        path = output / (case["id"] + ".png")
        image.save(path, dpi=(144, 144))
        oracle.append({"id": case["id"], "locale": case["locale"], "file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "fields": truth, "degradation": case.get("degradation"), "kind": "image"})

    case = spec["cases"][0]
    path = output / (spec["pdf_control"]["id"] + ".pdf")
    pdf = canvas.Canvas(str(path), pagesize=(500, 700), invariant=1)
    pdf.setTitle("VPJ-73 self-authored synthetic searchable control")
    pdf.setAuthor("VPJ-73 synthetic fixture generator")
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(30, 657, "SYNTHETIC TRAVEL MATERIAL")
    pdf.setFont("Helvetica", 11)
    pdf.drawString(30, 625, "Searchable PDF control / NOT A TICKET")
    truth = {}
    for index, key in enumerate(KEYS):
        size, x, baseline = 15, 30, 580 - index * 52.5
        text = LABELS["en"][index] + ": " + case["fields"][key]
        pdf.setFont("Helvetica", size)
        pdf.drawString(x, baseline, text)
        truth[key] = {"expected": normal(case["fields"][key]), "bbox": [x / 500, (700 - baseline - size) / 700, (x + stringWidth(text, "Helvetica", size)) / 500, (700 - baseline + size * 0.25) / 700], "page": 1, "status": "present"}
    pdf.setFont("Helvetica", 10)
    pdf.drawString(30, 125, case["note"])
    pdf.drawString(30, 35, "No purchase, booking or Trip is confirmed.")
    pdf.save()
    oracle.append({"id": spec["pdf_control"]["id"], "locale": "en", "file": path.name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "fields": truth, "kind": "pdf_control"})
    (output / "oracle.json").write_text(json.dumps({"schema_version": 1, "cases": oracle}, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"created": len(oracle), "oracle": str(output / "oracle.json")}))


if __name__ == "__main__":
    main()
