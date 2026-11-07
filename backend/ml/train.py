"""
Обучение ML-классификатора: CSV с колонками text, label (UTF-8).

Пример:
  cd backend && python -m ml.train --data data/train_dataset.csv.example --out models/ml_classifier.joblib
"""

from __future__ import annotations

import argparse
import hashlib
import platform
from importlib.metadata import version
import os
from collections import Counter

import joblib
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

from nlp.text_for_ml import normalize_text_for_ml


def train_from_csv(csv_path: str) -> tuple[Pipeline, dict]:
    with open(csv_path, "rb") as source:
        input_sha256 = hashlib.file_digest(source, "sha256").hexdigest()
        source.seek(0)
        df = pd.read_csv(source, encoding="utf-8")
    if "text" not in df.columns or "label" not in df.columns:
        raise ValueError("CSV must contain columns: text, label")

    df = df.dropna(subset=["text", "label"])
    texts = [normalize_text_for_ml(str(t)) for t in df["text"]]
    labels = [str(y).strip() for y in df["label"]]
    # убрать пустые после нормализации
    pairs = [(t, y) for t, y in zip(texts, labels, strict=True) if t.strip()]
    if len(pairs) < 2:
        raise ValueError("Нужно минимум 2 непустых документа после нормализации")
    texts, labels = zip(*pairs, strict=True)
    texts, labels = list(texts), list(labels)

    n_samples = len(texts)
    n_classes = len(set(labels))
    if n_classes < 2:
        raise ValueError("Нужно минимум 2 разных класса (label)")

    tfidf = TfidfVectorizer(
        ngram_range=(1, 2),
        min_df=1,
        max_df=0.95,
        sublinear_tf=True,
    )
    base_lr = LogisticRegression(
        max_iter=2000,
        class_weight="balanced",
        solver="lbfgs",
    )

    label_counts = Counter(labels)
    min_per_class = min(label_counts.values())
    calibration_cv: int | None = None
    if n_samples >= 12 and min_per_class >= 2:
        calibration_cv = min(5, max(2, n_samples // 4), min_per_class)

    calibrated = calibration_cv is not None
    estimator = Pipeline([("tfidf", tfidf), ("clf", base_lr)])
    if calibrated:
        # Calibrate raw documents so each fold learns vocabulary and IDF only
        # from its training subset. Pre-fitting TF-IDF on all rows leaks held-out
        # document statistics into the calibration folds.
        clf = CalibratedClassifierCV(estimator, method="sigmoid", cv=calibration_cv, ensemble=True)
        pipe = Pipeline([("clf", clf)])
    else:
        pipe = estimator
    pipe.fit(texts, labels)

    meta = {
        "version": "1.1",
        "input_sha256": input_sha256,
        "python": platform.python_version(),
        "packages": {name: version(name) for name in ("scikit-learn", "numpy", "pandas")},
        "feature_fit_scope": "calibration_training_fold" if calibrated else "all_training_rows",
        "calibrated": calibrated,
        "calibration_cv": calibration_cv,
        "train_samples": n_samples,
        "num_labels": n_classes,
        "min_samples_per_label": min_per_class,
    }
    return pipe, meta


def main() -> None:
    ap = argparse.ArgumentParser(description="Train CuTxT ML classifier (TF-IDF + LR)")
    ap.add_argument("--data", required=True, help="Path to CSV (text,label)")
    ap.add_argument("--out", required=True, help="Output .joblib path")
    args = ap.parse_args()

    pipe, meta = train_from_csv(args.data)
    out_dir = os.path.dirname(os.path.abspath(args.out))
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    bundle = {"pipeline": pipe, **meta}
    joblib.dump(bundle, args.out)
    print(f"Saved {args.out}  ({meta})")


if __name__ == "__main__":
    main()
