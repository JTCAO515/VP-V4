"""Download explicitly pinned public assets; never called by offline conversion."""
import hashlib
import json
import sys
import urllib.request
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS = ROOT / "artifacts/VPJ-73"
MODELS = [
    ("docling-project--docling-layout-heron", "apache-2.0", "https://huggingface.co/docling-project/docling-layout-heron/resolve/8f39ad3c0b4c58e9c2d2c84a38465abf757272d8/", ["README.md", "config.json", "preprocessor_config.json", "model.safetensors"]),
    ("tessdata", "Apache-2.0", "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/87416418657359cb625c412a48b6e1d6d41c29bd/", ["LICENSE", "eng.traineddata", "chi_sim.traineddata"]),
    ("font", "OFL-1.1", "https://raw.githubusercontent.com/google/fonts/334b789e33413f3aba4264d9aa6c97f7b94c5a2f/ofl/notosanssc/", ["OFL.txt", "NotoSansSC%5Bwght%5D.ttf"]),
]


def main():
    destination = Path(sys.argv[1]).resolve()
    total = 0
    records = []
    for directory, license_name, base, files in MODELS:
        for filename in files:
            target = destination / directory / urllib.parse.unquote(filename)
            target.parent.mkdir(parents=True, exist_ok=True)
            url = base + filename
            digest = hashlib.sha256()
            size = 0
            with urllib.request.urlopen(url, timeout=60) as response, target.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    size += len(chunk)
                    if total > 536870912:
                        raise RuntimeError("Frozen download budget exceeded")
                    digest.update(chunk)
                    output.write(chunk)
            records.append({"path": str(target), "url": url, "license": license_name, "bytes": size, "sha256": digest.hexdigest()})
            print(json.dumps(records[-1]), flush=True)
    config_url = "https://raw.githubusercontent.com/tesseract-ocr/tesseract/db0ec62f81b0737fbbe184d8fea40af5738f8eef/tessdata/configs/tsv"
    config = urllib.request.urlopen(config_url, timeout=30).read(4096)
    target = destination / "tessdata/configs/tsv"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(config)
    records.append({"path": str(target), "url": config_url, "sha256": hashlib.sha256(config).hexdigest(), "bytes": len(config), "license": "Apache-2.0"})
    # Setup on another machine must not rewrite the committed preflight evidence.
    (destination / "downloaded-assets-observed.json").write_text(json.dumps(records, indent=2) + "\n")


if __name__ == "__main__":
    main()
