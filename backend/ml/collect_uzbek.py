"""Download a version-pinned public corpus; retain source card and checksums."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

DATASET_ID = "risqaliyevds/uzbek-zero-shot-classification"
REVISION = "a4ad4607a7c1ffe492fe1420a05fb6c7b6165383"
FILE = "data/train-00000-of-00001.parquet"
SOURCE_URL = f"https://huggingface.co/datasets/{DATASET_ID}"


def download(url: str, path: Path) -> dict:
    temporary = path.with_suffix(path.suffix + ".partial")
    digest = hashlib.sha256()
    size = 0
    with urlopen(Request(url, headers={"User-Agent": "CuTxT-dataset/1.0"}), timeout=120) as response:
        with temporary.open("wb") as destination:
            while block := response.read(1024 * 1024):
                destination.write(block)
                digest.update(block)
                size += len(block)
    temporary.replace(path)
    return {"url": url, "filename": path.name, "bytes": size, "sha256": digest.hexdigest()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out-dir", default="data/uzbek_public")
    args = parser.parse_args()
    directory = Path(args.out_dir)
    directory.mkdir(parents=True, exist_ok=True)
    root = f"{SOURCE_URL}/resolve/{REVISION}"
    files = []
    for remote, local in [("README.md", "source-card.md"), (FILE, "source.parquet")]:
        print(f"Downloading {remote}", flush=True)
        files.append(download(f"{root}/{remote}", directory / local))
    manifest = {
        "dataset_id": DATASET_ID, "revision": REVISION, "source": SOURCE_URL,
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
        "declared_license": "MIT (publisher's dataset card)",
        "provenance_limit": "News-derived corpus; original article rights are not independently verified.",
        "files": files,
    }
    (directory / "source-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()
