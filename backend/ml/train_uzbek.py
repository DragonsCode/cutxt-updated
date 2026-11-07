"""Reproducible CPU training on the public Uzbek news corpus."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.frozen import FrozenEstimator
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, log_loss
from sklearn.model_selection import train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC
from threadpoolctl import threadpool_limits

from ml.collect_uzbek import DATASET_ID, REVISION
from nlp.uzbek_normalization import NORMALIZATION_VERSION, normalize_uzbek_text

LABELS = sorted([
    "Siyosat", "Iqtisodiyot", "Texnologiya", "Sport", "Madaniyat", "Salomatlik",
    "Oila va Jamiyat", "Ta'lim", "Ekologiya", "Xorijiy Yangiliklar",
])
SEED = 42


def prepare_corpus(frame: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Drop exact duplicates, repeated leads and ambiguously labelled groups.

    A lead is the first 40 normalized words (all words for shorter texts).
    This is conservative lead deduplication, not exhaustive near-duplicate detection.
    """
    if not {"text", "class"}.issubset(frame.columns):
        raise ValueError("Corpus must contain text and class columns")
    total = len(frame)
    data = frame[["text", "class"]].dropna().rename(columns={"class": "label"}).copy()
    unexpected = set(data.label) - set(LABELS)
    if unexpected:
        raise ValueError(f"Unexpected labels: {sorted(unexpected)}")
    data["normalized"] = data.text.map(normalize_uzbek_text)
    data = data[data.normalized.map(lambda text: len(text.split()) >= 8)].copy()
    valid = len(data)
    data["lead"] = data.normalized.map(lambda text: " ".join(text.split()[:40]))
    ambiguity = data.groupby("lead").label.nunique()
    conflicting_leads = set(ambiguity[ambiguity > 1].index)
    conflicts = int(data.lead.isin(conflicting_leads).sum())
    data = data[~data.lead.isin(conflicting_leads)].copy()
    before_dedup = len(data)
    data = data.drop_duplicates("lead").copy().reset_index(drop=True)
    data["document_hash"] = data.normalized.map(lambda text: hashlib.sha256(text.encode()).hexdigest())
    if data.document_hash.duplicated().any():
        raise ValueError("Exact duplicates survived lead deduplication")
    stats = {
        "source_rows": total, "invalid_or_short_rows_removed": total - valid,
        "conflicting_label_rows_removed": conflicts,
        "duplicate_or_repeated_lead_rows_removed": before_dedup - len(data),
        "retained_rows": len(data), "label_counts": data.label.value_counts().sort_index().to_dict(),
    }
    return data, stats


def split_corpus(data: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    train, remaining = train_test_split(data, test_size=0.2, random_state=SEED, stratify=data.label)
    calibration, test = train_test_split(remaining, test_size=0.5, random_state=SEED, stratify=remaining.label)
    return train, calibration, test


def make_pipeline() -> Pipeline:
    features = FeatureUnion([
        ("word", TfidfVectorizer(ngram_range=(1, 2), min_df=3, max_df=0.995,
                                max_features=140_000, sublinear_tf=True, dtype=np.float32,
                                token_pattern=r"(?u)\b\w+(?:'\w+)*\b")),
        ("char", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=3,
                                max_features=100_000, sublinear_tf=True, dtype=np.float32)),
    ], transformer_weights={"word": 1.0, "char": 0.65})
    return Pipeline([
        ("features", features),
        ("clf", LinearSVC(C=1.0, class_weight="balanced", dual="auto", max_iter=5000, random_state=SEED)),
    ])


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def train(data_dir: Path, out: Path, report_dir: Path) -> dict:
    started = time.monotonic()
    manifest = json.loads((data_dir / "source-manifest.json").read_text(encoding="utf-8"))
    if manifest["dataset_id"] != DATASET_ID or manifest["revision"] != REVISION:
        raise ValueError("Source revision does not match the pinned corpus")
    parquet = data_dir / "source.parquet"
    expected = next(file["sha256"] for file in manifest["files"] if file["filename"] == parquet.name)
    if hashlib.sha256(parquet.read_bytes()).hexdigest() != expected:
        raise ValueError("Source parquet checksum mismatch")
    data, cleaning = prepare_corpus(pd.read_parquet(parquet))
    print(f"Cleaned corpus: {cleaning}", flush=True)
    train_set, calibration_set, test_set = split_corpus(data)
    for name, subset in [("train", train_set), ("calibration", calibration_set), ("test", test_set)]:
        subset[["text", "label", "document_hash"]].to_csv(data_dir / f"{name}.csv.gz", index=False)
    split_manifest = pd.concat([
        subset[["document_hash", "label"]].assign(split=name)
        for name, subset in [("train", train_set), ("calibration", calibration_set), ("test", test_set)]
    ])
    split_manifest.to_csv(data_dir / "split-manifest.csv", index=False)
    print(f"Fitting features and LinearSVC on {len(train_set)} texts", flush=True)
    with threadpool_limits(limits=4):
        base = make_pipeline().fit(train_set.normalized, train_set.label)
        print(f"Calibrating on {len(calibration_set)} separate texts", flush=True)
        # FrozenEstimator prevents refitting either vocabulary or classifier on calibration/test data.
        model = CalibratedClassifierCV(FrozenEstimator(base), method="sigmoid")
        model.fit(calibration_set.normalized, calibration_set.label)
        print(f"Evaluating on {len(test_set)} untouched texts", flush=True)
        probabilities = model.predict_proba(test_set.normalized)
    labels = model.classes_.tolist()
    predictions = np.asarray(labels)[probabilities.argmax(axis=1)]
    metrics = {
        "accuracy": accuracy_score(test_set.label, predictions),
        "macro_f1": f1_score(test_set.label, predictions, average="macro"),
        "weighted_f1": f1_score(test_set.label, predictions, average="weighted"),
        "log_loss": log_loss(test_set.label, probabilities, labels=labels),
        "majority_baseline_accuracy": float(test_set.label.value_counts().max() / len(test_set)),
    }
    limitations = [
        "News topics; quality on administrative, scientific or internal documents has not been measured.",
        "Random stratified holdout, not a chronological or independent-source evaluation.",
        "Lead deduplication does not guarantee removal of every paraphrase or repeated news event.",
        "Cyrillic is transliterated; there is no independently labelled natural-Cyrillic test corpus.",
        "Always selects one of ten topics; no trained out-of-domain or Other class.",
    ]
    metadata = {
        "version": "uzbek-topics-1.0", "backend": "sklearn", "calibrated": True,
        "calibration_method": "sigmoid on separate 10% holdout", "normalization": NORMALIZATION_VERSION,
        "algorithm": "word/character TF-IDF + LinearSVC", "seed": SEED,
        "train_samples": len(train_set), "calibration_samples": len(calibration_set),
        "test_samples": len(test_set), "num_labels": len(labels), "label_names": labels,
        "scripts": ["Latin", "Cyrillic (transliterated)"], "dataset": DATASET_ID,
        "dataset_revision": REVISION, "test_metrics": metrics, "limitations": limitations,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "runtime": {"python": platform.python_version(), "scikit_learn": sklearn.__version__,
                    "numpy": np.__version__, "scipy": __import__("scipy").__version__, "joblib": joblib.__version__},
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": model, **metadata}, out, compress=3)
    model_hash = hashlib.sha256(out.read_bytes()).hexdigest()
    report = {
        **metadata, "cleaning": cleaning, "source": manifest,
        "model_sha256": model_hash,
        "split_manifest_sha256": hashlib.sha256((data_dir / "split-manifest.csv").read_bytes()).hexdigest(),
        "labels": labels, "per_class": classification_report(test_set.label, predictions, output_dict=True, zero_division=0),
        "confusion_matrix": confusion_matrix(test_set.label, predictions, labels=labels).tolist(),
        "training_seconds": round(time.monotonic() - started, 2),
    }
    write_json(report_dir / "uzbek-model-report.json", report)
    write_json(out.with_suffix(".meta.json"), metadata)
    print(json.dumps({"model": str(out), "metrics": metrics, "seconds": report["training_seconds"]}, indent=2), flush=True)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=Path("data/uzbek_public"))
    parser.add_argument("--out", type=Path, default=Path("models/ml_classifier.joblib"))
    parser.add_argument("--report-dir", type=Path, default=Path("../docs"))
    args = parser.parse_args()
    train(args.data_dir, args.out, args.report_dir)


if __name__ == "__main__":
    main()
