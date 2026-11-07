import unittest

import pandas as pd
from pydantic import ValidationError

from models import ClassifyRequest
from nlp.classifier import classify_text
from nlp.structural import classify_structural, document_zones


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tables = pd.DataFrame([{"id": 10, "name": "Government"}, {"id": 20, "name": "Department"}])
        self.keys = pd.DataFrame([
            {"key": "Prezident", "table_id": 10, "percent": 1, "weight": 1},
            {"key": "farmon", "table_id": 10, "percent": 1, "weight": 1},
            {"key": "kafedra", "table_id": 20, "percent": 1, "weight": 1},
            {"key": "bayonnoma", "table_id": 20, "percent": 1, "weight": 1},
        ])

    def classify(self, text, keys=None):
        return classify_structural(text, self.tables, self.keys if keys is None else keys)

    def test_header_beats_repeated_appendix_and_explains_zones(self):
        text = "Prezident\nFarmoni\nMaktab rivoji\nAsosiy matn\n1-ILOVA\n" + "kafedra bayonnoma " * 100
        self.assertEqual(classify_text(text, self.tables, self.keys)["predicted_category_id"], 20)
        result = self.classify(text)
        self.assertEqual(result["predicted_category_id"], 10)
        self.assertFalse(result["needs_review"])
        appendix = next(row for row in result["matched_keywords"] if row["key"] == "kafedra")
        self.assertEqual(appendix["zones"], {"header": 0, "body": 0, "appendix": 100})

    def test_duplicates_and_dictionary_scale_do_not_change_decision(self):
        text = "Prezident\nFarmoni\nMaktab rivoji\nKafedra"
        expected = self.classify(text)
        altered = self.keys.copy()
        altered.loc[altered.table_id == 20, "percent"] *= 100
        altered = pd.concat([altered, altered.iloc[[2]]], ignore_index=True)
        result = self.classify(text, altered)
        self.assertEqual(expected["all_scores"], result["all_scores"])
        self.assertEqual(expected["matched_keyword_rows"], result["matched_keyword_rows"])

    def test_ambiguous_and_unknown_documents_request_review(self):
        result = self.classify("Prezident kafedra\nFarmon bayonnoma\nMatn")
        self.assertTrue(result["needs_review"])
        self.assertEqual(result["margin_share"], 0)
        self.assertEqual(result["predicted_category_id"], 10)
        unknown = self.classify("Begona so'zlar")
        self.assertEqual(unknown["predicted_category"], "Unknown")
        self.assertTrue(unknown["needs_review"])

    def test_latin_cyrillic_and_split_header_phrase(self):
        keys = pd.DataFrame([{"key": "O’zbekiston Respublikasi Prezidenti", "table_id": 10, "percent": 1}])
        latin = self.classify("O‘zbekiston Respublikasi\nPrezidentining\nFarmoni", keys)
        cyrillic = self.classify("Ўзбекистон Республикаси\nПрезидентининг\nФармони", keys)
        self.assertEqual(latin["all_scores"], cyrillic["all_scores"])
        self.assertGreater(cyrillic["all_scores"][10], 0)

    def test_body_phrases_do_not_cross_paragraphs(self):
        keys = pd.DataFrame([{"key": "kun tartibi", "table_id": 20, "percent": 1}])
        result = self.classify("Sarlavha\nIkkinchi satr\nUchinchi satr\nkun\ntartibi", keys)
        self.assertEqual(result["predicted_category"], "Unknown")

    def test_header_limit_and_appendix_reference_in_body(self):
        zones = document_zones(" ".join(["matn"] * 200) + "\nikkinchi\nuchinchi\n1-ilovaga muvofiq\nkeyingi matn")
        self.assertEqual(sum(len(text.split()) for zone, text in zones if zone == "header"), 160)
        self.assertFalse(any(zone == "appendix" for zone, _ in zones))
        self.assertEqual(sum(len(text.split()) for _, text in zones), 207)

    def test_invalid_weights_rejected_and_request_requires_reference(self):
        keys = self.keys.copy()
        keys.loc[0, "percent"] = -1
        with self.assertRaises(ValueError):
            self.classify("Prezident", keys)
        with self.assertRaises(ValidationError):
            ClassifyRequest(document_id=1, method="structural")
        request = ClassifyRequest(document_id=1, database_id=2, method="structural")
        self.assertEqual(request.database_id, 2)


if __name__ == "__main__":
    unittest.main()
