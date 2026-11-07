"""Загрузка joblib-модели и предсказание."""

from __future__ import annotations

import json
import os
from typing import Any

import joblib

from ml.result_build import build_ml_classification_result
from ml.transformer_utils import (
    TRANSFORMER_BACKEND,
    TRANSFORMER_MAX_LENGTH,
    normalize_text_for_transformer,
)
from nlp.text_for_ml import normalize_text_for_ml
from nlp.uzbek_normalization import NORMALIZATION_VERSION, normalize_uzbek_text

_PIPELINE: Any = None
_TOKENIZER: Any = None
_META: dict[str, Any] = {}
_LOAD_ERROR: str | None = None


def _default_model_candidates() -> list[str]:
    return [
        os.path.join("models", "transformer_classifier"),
        os.path.join("models", "ml_classifier.joblib"),
    ]


def model_path() -> str:
    explicit = os.environ.get("ML_MODEL_PATH")
    if explicit:
        return explicit
    for candidate in _default_model_candidates():
        if _is_transformer_bundle(candidate) or os.path.isfile(candidate):
            return candidate
    return _default_model_candidates()[0]


def _transformer_meta_path(path: str) -> str:
    return os.path.join(path, "meta.json")


def _is_transformer_bundle(path: str) -> bool:
    return os.path.isdir(path) and os.path.isfile(_transformer_meta_path(path))


def _import_transformer_runtime():
    try:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
    except ImportError as exc:
        raise RuntimeError(
            "Transformer runtime dependencies are missing. "
            "Install torch, transformers, accelerate, and safetensors."
        ) from exc

    return torch, AutoModelForSequenceClassification, AutoTokenizer


def _sklearn_classes(pipe: Any) -> list[str]:
    try:
        if hasattr(pipe, "classes_"):
            return [str(x) for x in pipe.classes_]
        clf = pipe.named_steps.get("clf")
        if clf and hasattr(clf, "classes_"):
            return [str(x) for x in clf.classes_]
    except Exception:
        return []
    return []


def _load_transformer_bundle(path: str) -> tuple[Any, Any, dict[str, Any]]:
    with open(_transformer_meta_path(path), encoding="utf-8") as f:
        meta = json.load(f)
    _, auto_model_cls, auto_tokenizer_cls = _import_transformer_runtime()
    tokenizer = auto_tokenizer_cls.from_pretrained(path)
    model = auto_model_cls.from_pretrained(path)
    model.to("cpu")
    model.eval()

    if "label_names" not in meta or not meta["label_names"]:
        id2label = getattr(model.config, "id2label", {}) or {}
        meta["label_names"] = [str(id2label[idx]) for idx in sorted(id2label)]
    meta.setdefault("backend", TRANSFORMER_BACKEND)
    meta.setdefault("calibrated", False)
    meta.setdefault("max_length", TRANSFORMER_MAX_LENGTH)
    return model, tokenizer, meta


def load_ml_bundle() -> bool:
    """Возвращает True, если модель загружена."""
    global _PIPELINE, _TOKENIZER, _META, _LOAD_ERROR
    path = model_path()
    if not os.path.isfile(path) and not _is_transformer_bundle(path):
        _PIPELINE = None
        _TOKENIZER = None
        _META = {}
        _LOAD_ERROR = f"Файл модели не найден: {path}"
        return False
    try:
        if _is_transformer_bundle(path):
            _PIPELINE, _TOKENIZER, _META = _load_transformer_bundle(path)
        else:
            bundle = joblib.load(path)
            _TOKENIZER = None
            if isinstance(bundle, dict) and "pipeline" in bundle:
                _PIPELINE = bundle["pipeline"]
                _META = {k: v for k, v in bundle.items() if k != "pipeline"}
            else:
                _PIPELINE = bundle
                _META = {}
            _META.setdefault("backend", "sklearn")
        _LOAD_ERROR = None
        return True
    except Exception as e:
        _PIPELINE = None
        _TOKENIZER = None
        _META = {}
        _LOAD_ERROR = str(e)
        return False


def ml_status() -> dict[str, Any]:
    path = model_path()
    if _PIPELINE is not None:
        if _META.get("backend") == TRANSFORMER_BACKEND:
            classes = [str(x) for x in _META.get("label_names", [])]
        else:
            classes = _sklearn_classes(_PIPELINE)
        return {
            "available": True,
            "path": os.path.abspath(path),
            "model_version": _META.get("version", "unknown"),
            "calibrated": _META.get("calibrated", False),
            "backend": _META.get("backend", "sklearn"),
            "labels": classes,
            "training_samples": _META.get("train_samples"),
            "test_samples": _META.get("test_samples"),
            "algorithm": _META.get("algorithm"),
            "scripts": _META.get("scripts", []),
            "dataset": _META.get("dataset"),
            "test_metrics": _META.get("test_metrics"),
            "limitations": _META.get("limitations", []),
        }
    err = _LOAD_ERROR or "Модель не загружена"
    return {
        "available": False,
        "path": os.path.abspath(path) if os.path.exists(path) else path,
        "error": err,
    }


def ensure_loaded() -> None:
    if _PIPELINE is None:
        load_ml_bundle()


def classify_ml_text(raw_text: str) -> dict[str, Any]:
    ensure_loaded()
    if _PIPELINE is None:
        raise RuntimeError(_LOAD_ERROR or "ML model not available")

    backend = _META.get("backend", "sklearn")
    if backend == TRANSFORMER_BACKEND:
        text = normalize_text_for_transformer(raw_text)
        if not text.strip():
            raise ValueError("После нормализации текст пуст — нечего классифицировать")

        torch, _, _ = _import_transformer_runtime()
        max_length = int(_META.get("max_length", TRANSFORMER_MAX_LENGTH))
        encoded = _TOKENIZER([text], truncation=True, max_length=max_length, return_tensors="pt")
        with torch.no_grad():
            logits = _PIPELINE(**encoded).logits[0]
        proba = torch.softmax(logits, dim=-1).cpu().tolist()
        classes = [str(x) for x in _META.get("label_names", [])]
    else:
        if _META.get("normalization") == NORMALIZATION_VERSION:
            text = normalize_uzbek_text(raw_text)
        else:
            text = normalize_text_for_ml(raw_text)
        if not text.strip():
            raise ValueError("После нормализации текст пуст — нечего классифицировать")

        proba = _PIPELINE.predict_proba([text])[0]
        classes = _sklearn_classes(_PIPELINE)
        if not classes:
            raise RuntimeError("Pipeline не содержит classes_ после обучения")
    class_names = [str(c) for c in classes]

    calibrated = bool(_META.get("calibrated", False))
    version = str(_META.get("version", "1"))

    return build_ml_classification_result(
        class_names=class_names,
        probabilities=[float(x) for x in proba],
        calibrated=calibrated,
        model_version=version,
    )
