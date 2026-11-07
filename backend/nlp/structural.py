from collections import Counter, defaultdict
from math import isfinite, log2, sqrt
import re

import pandas as pd

from nlp.classifier import _build_trie, _match_spans, summarize_scores
from nlp.uzbek_normalization import normalize_uzbek_text

STRUCTURAL_VERSION = "archive-1.0"
ZONE_WEIGHTS = {"header": 3.0, "body": 1.0, "appendix": 0.25}
HEADER_LINES = 3
HEADER_WORDS = 160
REVIEW_MARGIN = 0.10
_APPENDIX = re.compile(r"(?:\d+\s*)?ilova", re.IGNORECASE)


def document_zones(text: str) -> list[tuple[str, str]]:
    paragraphs = [line.strip() for line in text.splitlines() if line.strip()]
    zones = []
    header_words = 0
    in_appendix = False
    for index, paragraph in enumerate(paragraphs):
        normalized = normalize_uzbek_text(paragraph, keep_numbers=True)
        if not normalized:
            continue
        # DOCX sometimes joins the act reference and the appendix label.
        appendix_heading = (_APPENDIX.fullmatch(normalized)
                            or re.search(r"(?:ILOVA|ИЛОВА)\s*$", paragraph))
        if index >= HEADER_LINES and appendix_heading:
            in_appendix = True
        words = normalized.split()
        if index < HEADER_LINES and not in_appendix:
            remaining = max(0, HEADER_WORDS - header_words)
            if remaining:
                zones.append(("header", " ".join(words[:remaining])))
                header_words += min(remaining, len(words))
            if len(words) > remaining:
                zones.append(("body", " ".join(words[remaining:])))
        else:
            zones.append(("appendix" if in_appendix else "body", normalized))
    return zones


def classify_structural(text: str, tables: pd.DataFrame, keys: pd.DataFrame) -> dict:
    categories = {int(row.id): str(row.name) for row in tables.itertuples()}
    vocabulary = {}
    for row in keys.to_dict("records"):
        key = normalize_uzbek_text(str(row["key"]), keep_numbers=True)
        category = int(row["table_id"])
        if not key or category not in categories:
            continue
        weight = row.get("weight")
        base = float(row["percent"]) * (1.0 if weight is None or pd.isna(weight) else float(weight))
        if not isfinite(base) or base < 0:
            raise ValueError("Archive scoring requires finite, non-negative keyword weights")
        identity = (category, key)
        if identity not in vocabulary or base > vocabulary[identity]["base"]:
            vocabulary[identity] = {"key": str(row["key"]), "normalized": key,
                                    "table_id": category, "base": base}
    entries = sorted(vocabulary.values(), key=lambda item: (item["table_id"], item["normalized"]))
    match_frame = pd.DataFrame(entries, columns=["key", "normalized", "table_id", "base"])
    match_frame["key"] = match_frame.normalized
    owners = defaultdict(set)
    maxima = defaultdict(float)
    category_sizes = Counter()
    for entry in entries:
        owners[entry["normalized"]].add(entry["table_id"])
        maxima[entry["table_id"]] = max(maxima[entry["table_id"]], entry["base"])
        if entry["base"] > 0:
            category_sizes[entry["table_id"]] += 1

    counts = {zone: Counter() for zone in ZONE_WEIGHTS}
    excerpts = {}
    zones = document_zones(text)
    # Allow a title phrase split over adjacent header lines; body phrases stay within paragraphs.
    header = " ".join(content for zone, content in zones if zone == "header")
    segments = [("header", header)] + [(zone, content) for zone, content in zones if zone != "header"]
    trie = _build_trie(match_frame)
    for zone, content in segments:
        tokens = content.split()
        for index, start, end in _match_spans(tokens, trie):
            counts[zone][index] += 1
            excerpts.setdefault((index, zone), " ".join(tokens[max(0, start - 8):end + 8]))

    scores = {category: 0.0 for category in categories}
    evidence = []
    for index, entry in enumerate(entries):
        occurrences = {zone: counts[zone][index] for zone in ZONE_WEIGHTS}
        if not any(occurrences.values()) or not entry["base"]:
            continue
        category = entry["table_id"]
        specificity = 1 + log2((len(categories) + 1) / (len(owners[entry["normalized"]]) + 1))
        phrase_factor = sqrt(min(4, len(entry["normalized"].split())))
        importance = entry["base"] / maxima[category]
        normalization = sqrt(category_sizes[category])
        contributions = {zone: ZONE_WEIGHTS[zone] * log2(1 + occurrences[zone])
                         * importance * specificity * phrase_factor / normalization
                         for zone in ZONE_WEIGHTS}
        score = sum(contributions.values())
        scores[category] += score
        evidence.append({"key": entry["key"], "category_id": category,
                         "category": categories[category], "occurrences": sum(occurrences.values()),
                         "score": score, "zones": occurrences, "zone_scores": contributions,
                         "shared_categories": len(owners[entry["normalized"]]),
                         "excerpts": {zone: excerpts[index, zone] for zone, count in occurrences.items() if count}})

    result = summarize_scores(scores, categories)
    winner = result["predicted_category_id"]
    winner_evidence = [item for item in evidence if item["category_id"] == winner]
    reasons = []
    if winner is None:
        reasons.append("В тексте не найдены ключи из базы.")
    else:
        if len(winner_evidence) < 2:
            reasons.append("Решение опирается менее чем на два разных ключа.")
        if not any(item["zones"]["header"] and item["shared_categories"] == 1 for item in winner_evidence):
            reasons.append("В заголовке нет ключа, характерного только для выбранной папки.")
        if result["margin_share"] is not None and result["margin_share"] < REVIEW_MARGIN:
            reasons.append("Две ведущие папки набрали близкие оценки.")
    return {**result, "classification_kind": "structural", "classifier_version": STRUCTURAL_VERSION,
            "matching": "Uzbek Latin/Cyrillic, phrases, document zones and bounded suffix rules",
            "scoring": {"zone_weights": ZONE_WEIGHTS, "header_lines": HEADER_LINES,
                        "header_words": HEADER_WORDS, "review_margin": REVIEW_MARGIN,
                        "repetitions": "log2(1 + count)", "category_normalization": "sqrt(distinct positive keys)"},
            "needs_review": bool(reasons), "review_reasons": reasons,
            "matched_keyword_rows": len(evidence),
            "matched_keywords": sorted(evidence, key=lambda item: (-item["score"], item["category_id"], item["key"]))}
