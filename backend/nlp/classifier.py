from typing import Any
from collections import Counter

import pandas as pd

from nlp.uzbek_normalization import normalize_uzbek_text

_SCORE_EPS = 1e-9
DICTIONARY_VERSION = "dictionary-2.0"

# Ограниченные правила окончаний вместо произвольного совпадения по префиксу.
_SUFFIXES = {
    plural + possessive + case
    for plural in ("", "lar")
    for possessive in ("", "i", "si", "im", "imiz", "ing", "ingiz")
    for case in ("", "ning", "ni", "ga", "ka", "qa", "da", "dan")
    if plural + possessive + case
}
_TERMINALS = object()


def _word_forms(word: str) -> set[str]:
    forms = {word}
    for suffix in _SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            forms.add(word[:-len(suffix)])
    return forms


def _build_trie(keys_df: pd.DataFrame) -> dict:
    root: dict = {}
    for index, key in enumerate(keys_df["key"]):
        words = normalize_uzbek_text(str(key), keep_numbers=True).split()
        if not words:
            continue
        node = root
        for word in words:
            node = node.setdefault(word, {})
        node.setdefault(_TERMINALS, []).append(index)
    return root


def _match_spans(tokens: list[str], root: dict):
    forms = [_word_forms(token) for token in tokens]
    for start in range(len(tokens)):
        nodes = [root]
        for position in range(start, len(tokens)):
            next_nodes = [node[form] for node in nodes for form in forms[position] if form in node]
            if not next_nodes:
                break
            for node in next_nodes:
                for index in node.get(_TERMINALS, []):
                    yield index, start, position + 1
            nodes = next_nodes


def _keyword_matches(tokens: list[str], keys_df: pd.DataFrame) -> Counter:
    return Counter(index for index, _, _ in _match_spans(tokens, _build_trie(keys_df)))


def classify_text(
    text: str, tables_df: pd.DataFrame, keys_df: pd.DataFrame
) -> dict[str, Any]:
    """Сумма occurrences × percent × weight; доли баллов не являются вероятностями."""
    tokens = normalize_uzbek_text(text, keep_numbers=True).split()

    category_map = dict(zip(tables_df["id"], tables_df["name"]))
    category_scores = {int(cat_id): 0.0 for cat_id in category_map.keys()}

    has_weight = "weight" in keys_df.columns
    matches = _keyword_matches(tokens, keys_df)
    matched_keywords = []
    for index, count in sorted(matches.items()):
        key_row = keys_df.iloc[index]
        cat_id = int(key_row["table_id"])
        base = float(key_row["percent"])
        weight = key_row["weight"] if has_weight else None
        mult = 1.0 if weight is None or pd.isna(weight) else float(weight)
        score_add = count * base * mult
        if cat_id in category_scores:
            category_scores[cat_id] += score_add
            matched_keywords.append({
                "key": str(key_row["key"]), "category_id": cat_id,
                "category": str(category_map[cat_id]), "occurrences": count,
                "score": score_add,
            })

    return {
        **summarize_scores(category_scores, category_map),
        "classification_kind": "dictionary",
        "classifier_version": DICTIONARY_VERSION,
        "matching": "Uzbek Latin/Cyrillic, contiguous phrases and bounded suffix rules",
        "matched_keyword_rows": len(matched_keywords),
        "matched_keywords": sorted(matched_keywords, key=lambda item: (-item["score"], item["category_id"], item["key"])),
    }


def summarize_scores(category_scores: dict, category_map: dict) -> dict:
    total = sum(category_scores.values())

    predicted_category = "Unknown"
    predicted_cat_id = None
    relative_score_share = 0.0
    score_shares: dict[int, float] = {cid: 0.0 for cid in category_scores}
    score_shares_by_name: dict[str, float] = {
        str(category_map.get(cid, cid)): 0.0 for cid in category_scores
    }

    margin_raw: float | None = None
    margin_share: float | None = None
    runner_up_category_id: int | None = None
    runner_up_category: str | None = None
    runner_up_raw: float | None = None
    runner_up_share: float | None = None
    only_one_scoring_class = False

    if total > 0:
        predicted_cat_id = min(category_scores, key=lambda cid: (-category_scores[cid], cid))
        predicted_category = str(category_map.get(predicted_cat_id, "Unknown"))
        relative_score_share = category_scores[predicted_cat_id] / total

        score_shares = {
            cid: category_scores[cid] / total for cid in category_scores.keys()
        }
        score_shares_by_name = {
            str(category_map.get(cid, cid)): score_shares[cid]
            for cid in category_scores.keys()
        }

        positive = [
            (cid, category_scores[cid])
            for cid in category_scores
            if category_scores[cid] > _SCORE_EPS
        ]
        positive.sort(key=lambda x: (-x[1], x[0]))

        if len(positive) == 1:
            only_one_scoring_class = True
        elif len(positive) >= 2:
            best_id, best_v = positive[0]
            run_id, run_v = positive[1]
            runner_up_category_id = run_id
            runner_up_category = str(category_map.get(run_id, "Unknown"))
            runner_up_raw = run_v
            runner_up_share = score_shares[run_id]
            margin_raw = best_v - run_v
            margin_share = score_shares[best_id] - score_shares[run_id]

    scores_by_name = {
        str(category_map.get(cid, cid)): score for cid, score in category_scores.items()
    }

    return {
        "predicted_category": predicted_category,
        "predicted_category_id": predicted_cat_id,
        "relative_score_share": relative_score_share,
        "confidence": relative_score_share,
        "margin_raw": margin_raw,
        "margin_share": margin_share,
        "runner_up_category_id": runner_up_category_id,
        "runner_up_category": runner_up_category,
        "runner_up_raw": runner_up_raw,
        "runner_up_share": runner_up_share,
        "only_one_scoring_class": only_one_scoring_class,
        "all_scores": category_scores,
        "all_scores_by_name": scores_by_name,
        "score_shares": score_shares,
        "score_shares_by_name": score_shares_by_name,
    }
