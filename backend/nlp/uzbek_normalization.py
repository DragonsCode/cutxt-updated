"""Shared Latin/Cyrillic normalization for the Uzbek topic model.

This is orthographic transliteration, not translation or language detection.
Legacy dictionary and ML normalization deliberately remain unchanged.
"""

import re
import unicodedata

NORMALIZATION_VERSION = "uzbek-latin-v1"
_APOSTROPHES = str.maketrans({c: "'" for c in "‘’ʻʼʹ`´՚"})
_CYRILLIC = dict(zip(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюяўқғҳ",
    ["a", "b", "v", "g", "d", "e", "yo", "j", "z", "i", "y", "k", "l", "m",
     "n", "o", "p", "r", "s", "t", "u", "f", "x", "ts", "ch", "sh", "shch",
     "'", "i", "", "e", "yu", "ya", "o'", "q", "g'", "h"],
    strict=True,
))
_WORDS = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)*", re.UNICODE)
_WORDS_WITH_NUMBERS = re.compile(r"[^\W_]+(?:'[^\W_]+)*", re.UNICODE)


def normalize_uzbek_text(text: str, *, keep_numbers: bool = False) -> str:
    # Normalize apostrophes before NFKC: acute accent otherwise becomes a space
    # followed by a combining accent and splits Uzbek letters into separate words.
    text = unicodedata.normalize("NFKC", str(text or "").translate(_APOSTROPHES)).lower().translate(_APOSTROPHES)
    text = re.sub(r"\bе|(?<=[аеёиоуэюяўъь])е", "ye", text)
    text = re.sub(r"\bц", "s", text)
    text = "".join(_CYRILLIC.get(char, char) for char in text)
    # Spaces around modifier letters sometimes appear after PDF extraction.
    text = re.sub(r"\b([og])\s*'\s*(?=[a-z])", r"\1'", text)
    pattern = _WORDS_WITH_NUMBERS if keep_numbers else _WORDS
    return " ".join(pattern.findall(text))
