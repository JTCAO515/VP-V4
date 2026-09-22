"""Render self-authored cards with Pillow. Usage: python3 render-vision-fixtures.py OUTDIR.
No AI image generation, remote font or customer material. Output is derived, not committed.
Requires local Noto Sans CJK or macOS PingFang and Pillow.
"""
import json
import pathlib
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFont

root = pathlib.Path(__file__).resolve().parents[2]
script = "import {VISION_CASES} from './evals/media/vision-cases.ts'; console.log(JSON.stringify(VISION_CASES));"
cases = json.loads(subprocess.check_output(["node", "--experimental-strip-types", "--input-type=module", "-e", script], cwd=root))
fonts = ["/System/Library/Fonts/PingFang.ttc", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]
font_path = next((path for path in fonts if pathlib.Path(path).is_file()), None)
if font_path is None:
    raise SystemExit("UNRUN: install/select an existing CJK font before rendering")
font = ImageFont.truetype(font_path, 32)
out = pathlib.Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for case in cases:
    image = Image.new("RGB", (960, 560), "white")
    draw = ImageDraw.Draw(image)
    for i, line in enumerate(case["lines"]):
        if draw.textbbox((0, 0), line, font=font)[2] > 880:
            raise SystemExit("Fixture text exceeds canvas")
        draw.text((40, 30 + i * 62), line, font=font, fill="black")
    image.save(out / (case["id"] + ".png"))
print(json.dumps({"cases": len(cases), "font": font_path, "dimensions": [960, 560]}))
