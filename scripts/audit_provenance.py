"""Local provenance inventory, not a plagiarism score or a license verdict.

Run with the backend Python environment to include its installed metadata.
No files or source fragments are transmitted to external services.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from importlib import metadata
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT, stderr=subprocess.DEVNULL)


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def inventory(output: Path) -> dict:
    head = git("rev-parse", "HEAD").decode().strip()
    paths = sorted(set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0")) - {""})
    files = []
    for name in paths:
        path = ROOT / name
        if path.resolve() == output.resolve() or not path.is_file():
            continue
        content = path.read_bytes()
        try:
            original = git("show", f"{head}:{name}")
        except subprocess.CalledProcessError:
            original = None
        state = "new_relative_to_head" if original is None else (
            "unchanged_relative_to_head" if content.replace(b"\r\n", b"\n") == original.replace(b"\r\n", b"\n") else "modified_relative_to_head")
        item = {"path": name, "bytes": len(content), "sha256": digest(content), "baseline_state": state}
        if original is not None:
            item["baseline_sha256"] = digest(original)
        if path.suffix == ".ipynb":
            notebook = json.loads(content)
            item["notebook_cells"] = len(notebook.get("cells", []))
            item["cells_with_outputs"] = sum(bool(cell.get("outputs")) for cell in notebook.get("cells", []))
        files.append(item)

    package = json.loads((ROOT / "frontend/package.json").read_text(encoding="utf-8"))
    lock = json.loads((ROOT / "frontend/package-lock.json").read_text(encoding="utf-8"))["packages"]
    frontend = []
    for kind in ("dependencies", "devDependencies"):
        for name, requirement in sorted(package[kind].items()):
            entry = lock.get(f"node_modules/{name}", {})
            frontend.append({"name": name, "kind": kind, "requirement": requirement,
                             "locked_version": entry.get("version"), "declared_license": entry.get("license", "UNKNOWN")})
    dependency_entries = [entry for name, entry in lock.items() if name]

    requirements: dict[str, set[str]] = {}
    for filename in ("backend/requirements.txt", "backend/requirements-uzbek.txt"):
        for line in (ROOT / filename).read_text(encoding="utf-8").splitlines():
            match = re.match(r"([A-Za-z0-9_.-]+)(.*)", line.strip())
            if match:
                requirements.setdefault(match[1], set()).add(line.strip())
    backend = []
    for name, declarations in sorted(requirements.items(), key=lambda pair: pair[0].lower()):
        item = {"name": name, "requirements": sorted(declarations)}
        try:
            distribution = metadata.distribution(name)
            fields = distribution.metadata
            classifiers = [value.split(" :: ")[-1] for value in fields.get_all("Classifier", []) if value.startswith("License ::")]
            license_text = fields.get("License-Expression") or fields.get("License") or "; ".join(classifiers) or "UNKNOWN"
            item.update(installed_version=distribution.version, declared_license=license_text[:500],
                        license_metadata_truncated=len(license_text) > 500,
                        license_files=[str(file) for file in (distribution.files or [])
                                       if any(word in Path(str(file)).name.lower() for word in ("license", "copying", "notice"))])
        except metadata.PackageNotFoundError:
            item.update(installed_version=None, declared_license="UNVERIFIED_NOT_INSTALLED")
        backend.append(item)

    artifacts = []
    for name in ("backend/models/ml_classifier.joblib", "backend/models/ml_classifier.meta.json",
                 "backend/data/uzbek_public/source-manifest.json", "backend/data/uzbek_public/source-card.md"):
        path = ROOT / name
        if path.is_file():
            content = path.read_bytes()
            artifacts.append({"path": name, "bytes": len(content), "sha256": digest(content),
                              "git_ignored": subprocess.run(["git", "check-ignore", "-q", name], cwd=ROOT).returncode == 0})
    model_report = json.loads((ROOT / "docs/uzbek-model-report.json").read_text(encoding="utf-8"))
    model_item = next((item for item in artifacts if item["path"].endswith(".joblib")), None)

    return {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "kind": "local_provenance_audit_not_plagiarism_check",
        "plagiarism_percentage": None,
        "scope": "Git tracked and non-ignored files; declared dependencies; selected local model/source metadata",
        "baseline_commit": head,
        "origin": git("remote", "get-url", "origin").decode().strip(),
        "historical_author_names": sorted(set(git("log", "--all", "--format=%an").decode().splitlines())),
        "limitations": [
            "Git author names do not establish the student's identity or sole authorship.",
            "Changes relative to HEAD are not a measure of originality or individual authorship.",
            "No external code corpus, institutional plagiarism service or dissertation manuscript was checked.",
            "Dependency licenses come from local package metadata, not a full license-compliance review.",
            "Ignored environments, vendor code, uploads and datasets are outside the source-file inventory.",
        ],
        "source_file_counts": dict(Counter(item["baseline_state"] for item in files)),
        "files": files,
        "frontend_direct_dependencies": frontend,
        "frontend_lock_dependency_entries": len(dependency_entries),
        "frontend_lock_license_counts": dict(Counter(entry.get("license", "UNKNOWN") for entry in dependency_entries)),
        "backend_declared_dependencies": backend,
        "local_artifacts": artifacts,
        "model_hash_matches_training_report": bool(model_item and model_item["sha256"] == model_report["model_sha256"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=ROOT / "docs/provenance-audit.json")
    args = parser.parse_args()
    result = inventory(args.out)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"report": str(args.out), "counts": result["source_file_counts"],
                      "npm_licenses": result["frontend_lock_license_counts"],
                      "python_missing": [item["name"] for item in result["backend_declared_dependencies"] if not item["installed_version"]],
                      "model_hash_verified": result["model_hash_matches_training_report"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
