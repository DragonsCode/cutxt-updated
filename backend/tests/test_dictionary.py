import tempfile
import unittest
from pathlib import Path

import pandas as pd
from docx import Document

from nlp.classifier import classify_text
from nlp.loader import load_document


class DictionaryTests(unittest.TestCase):
    def classify(self, text, rows):
        tables = pd.DataFrame([{"id": 1, "name": "Government"}, {"id": 2, "name": "University"}])
        return classify_text(text, tables, pd.DataFrame(rows))

    def test_cyrillic_apostrophes_and_possessive_phrase(self):
        rows = [
            {"key": "O’zbekiston Respublikasi Prezidenti", "table_id": 1, "percent": 0.7, "weight": 10},
            {"key": "farmon", "table_id": 1, "percent": 0.25, "weight": 4},
        ]
        latin = self.classify("O‘zbekiston Respublikasi Prezidentining farmoni", rows)
        cyrillic = self.classify("Ўзбекистон Республикаси Президентининг ФАРМОНИ", rows)
        self.assertEqual(latin["all_scores"], cyrillic["all_scores"])
        self.assertEqual(cyrillic["all_scores"][1], 8)
        self.assertEqual(cyrillic["matched_keyword_rows"], 2)

    def test_phrase_order_and_word_boundaries(self):
        rows = [{"key": "kun tartibi", "table_id": 2, "percent": 1}]
        self.assertEqual(self.classify("Kun tartibi, kun tartibining", rows)["all_scores"][2], 2)
        for text in ["tartibi kun", "kun va tartibi", "kun tartibix"]:
            self.assertEqual(self.classify(text, rows)["predicted_category"], "Unknown")

    def test_numbered_keywords_do_not_collapse_to_generic_words(self):
        rows = [{"key": "2-shakl,", "table_id": 2, "percent": 1}]
        self.assertEqual(self.classify("2-шакл", rows)["all_scores"][2], 1)
        for text in ["shakl", "3-shakl"]:
            self.assertEqual(self.classify(text, rows)["predicted_category"], "Unknown")

    def test_repetitions_null_weights_and_duplicate_rows_keep_score_formula(self):
        rows = [
            {"key": "qaror", "table_id": 1, "percent": 0.5, "weight": 4},
            {"key": "qaror", "table_id": 2, "percent": 0.2, "weight": None},
        ]
        result = self.classify("qaror qarorlari qaroriga", rows)
        self.assertEqual(result["all_scores"][1], 6)
        self.assertAlmostEqual(result["all_scores"][2], 0.6)
        self.assertAlmostEqual(sum(result["score_shares"].values()), 1)
        self.assertEqual(result["matched_keywords"][0]["occurrences"], 3)

    def test_ties_are_deterministic_and_empty_text_is_unknown(self):
        tables = pd.DataFrame([{"id": 2, "name": "B"}, {"id": 1, "name": "A"}])
        keys = pd.DataFrame([{"key": "qaror", "table_id": i, "percent": 1} for i in [2, 1]])
        self.assertEqual(classify_text("qaror", tables, keys)["predicted_category_id"], 1)
        result = classify_text("", tables, keys)
        self.assertEqual(result["predicted_category"], "Unknown")
        self.assertEqual(result["matched_keywords"], [])


class DocxExtractionTests(unittest.TestCase):
    def test_tables_nested_tables_and_merged_cells_are_read_once_in_order(self):
        document = Document()
        document.add_paragraph("before")
        table = document.add_table(rows=1, cols=2)
        cell = table.cell(0, 0).merge(table.cell(0, 1))
        cell.text = "Ўзбекистон Президентининг фармони"
        nested = cell.add_table(rows=1, cols=1)
        nested.cell(0, 0).text = "nested"
        document.add_paragraph("after")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.DOCX"
            document.save(path)
            text = load_document(str(path))
        self.assertEqual(text.count("Ўзбекистон Президентининг фармони"), 1)
        self.assertLess(text.index("before"), text.index("Ўзбекистон"))
        self.assertLess(text.index("Ўзбекистон"), text.index("nested"))
        self.assertLess(text.index("nested"), text.index("after"))


if __name__ == "__main__":
    unittest.main()
