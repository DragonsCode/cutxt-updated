import unittest
import tempfile
from pathlib import Path
from unittest import mock

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator

from ml.train_uzbek import make_pipeline, prepare_corpus, split_corpus
from nlp.uzbek_normalization import NORMALIZATION_VERSION, normalize_uzbek_text


class UzbekNormalizationTests(unittest.TestCase):
    def test_latin_and_cyrillic_have_same_features(self):
        pairs = [
            ("O‘zbekiston iqtisodiyoti va ta’lim", "Ўзбекистон иқтисодиёти ва таълим"),
            ("Gʻolib futbol jamoasi chempion bo‘ldi", "Ғолиб футбол жамоаси чемпион бўлди"),
            ("Sog'liqni saqlash shifoxona", "Соғлиқни сақлаш шифохона"),
            ("Yevropa litsey konstitutsiya sirk", "Европа лицей конституция цирк"),
        ]
        for latin, cyrillic in pairs:
            self.assertEqual(normalize_uzbek_text(latin), normalize_uzbek_text(cyrillic))

    def test_apostrophes_and_pdf_spaces(self):
        expected = "o'zbekiston g'olib ta'lim"
        for apostrophe in ["'", "‘", "’", "ʻ", "ʼ", "`", "´"]:
            self.assertEqual(normalize_uzbek_text(f"O{apostrophe}zbekiston g{apostrophe}olib ta{apostrophe}lim"), expected)
        self.assertEqual(normalize_uzbek_text("O ‘ zbekiston G ‘ olib"), "o'zbekiston g'olib")
        self.assertEqual(normalize_uzbek_text(expected), expected)
        self.assertEqual(normalize_uzbek_text("123 !!!"), "")


class CorpusSplitTests(unittest.TestCase):
    def test_duplicates_and_conflicting_labels_removed_before_split(self):
        lead = " ".join(["yangilik"] * 40)
        frame = pd.DataFrame([
            {"text": "O‘zbekiston iqtisodiyoti va ta’lim haqida bugun yangi xabar berildi", "class": "Iqtisodiyot"},
            {"text": "Ўзбекистон иқтисодиёти ва таълим ҳақида бугун янги хабар берилди", "class": "Iqtisodiyot"},
            {"text": lead + " birinchi davom", "class": "Sport"},
            {"text": lead + " ikkinchi davom", "class": "Sport"},
            {"text": "bir ikki uch tort besh olti yetti sakkiz", "class": "Sport"},
            {"text": "bir ikki uch tort besh olti yetti sakkiz", "class": "Siyosat"},
        ])
        clean, stats = prepare_corpus(frame)
        self.assertEqual(len(clean), 2)
        self.assertEqual(stats["conflicting_label_rows_removed"], 2)
        self.assertEqual(stats["duplicate_or_repeated_lead_rows_removed"], 2)

    def test_holdouts_are_disjoint_and_stratified(self):
        frame = pd.DataFrame([
            {"text": f"{label} {' '.join(chr(97 + i // 26) + chr(97 + i % 26) for _ in range(8))}", "class": label}
            for label in ["Sport", "Siyosat"] for i in range(100)
        ])
        clean, _ = prepare_corpus(frame)
        train, calibration, test = split_corpus(clean)
        self.assertEqual([len(train), len(calibration), len(test)], [160, 20, 20])
        hashes = [set(part.document_hash) for part in [train, calibration, test]]
        self.assertFalse(hashes[0] & hashes[1] or hashes[0] & hashes[2] or hashes[1] & hashes[2])
        self.assertEqual(set(test.label), {"Sport", "Siyosat"})


class ModelIntegrationTests(unittest.TestCase):
    def test_calibration_is_frozen_and_service_roundtrip_preserves_scripts(self):
        from ml import service

        sport = "futbol jamoa gol chempion musobaqa"
        economy = "iqtisodiyot bank moliya kredit investitsiya"
        base = make_pipeline().fit([sport] * 6 + [economy] * 6, ["Sport"] * 6 + ["Iqtisodiyot"] * 6)
        original_coefficients = base.named_steps["clf"].coef_.copy()
        calibrated = CalibratedClassifierCV(FrozenEstimator(base), method="sigmoid")
        calibrated.fit([sport + " validationonly"] * 6 + [economy + " validationonly"] * 6,
                       ["Sport"] * 6 + ["Iqtisodiyot"] * 6)
        word_vectorizer = dict(base.named_steps["features"].transformer_list)["word"]
        self.assertNotIn("validationonly", word_vectorizer.vocabulary_)
        np.testing.assert_array_equal(original_coefficients, base.named_steps["clf"].coef_)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test-model.joblib"
            joblib.dump({"pipeline": calibrated, "normalization": NORMALIZATION_VERSION,
                         "version": "integration-test", "calibrated": True}, path)
            with mock.patch.dict("os.environ", {"ML_MODEL_PATH": str(path)}):
                self.assertTrue(service.load_ml_bundle())
                latin = service.classify_ml_text(sport)
                cyrillic = service.classify_ml_text("футбол жамоа гол чемпион мусобақа")
                self.assertEqual(latin["predicted_category"], "Sport")
                self.assertEqual(latin["all_scores_by_name"], cyrillic["all_scores_by_name"])
                self.assertTrue(latin["calibrated"])
                self.assertAlmostEqual(sum(latin["all_scores_by_name"].values()), 1)
                self.assertEqual(latin["model_version"], "integration-test")


if __name__ == "__main__":
    unittest.main()
