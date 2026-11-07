import csv
import hashlib
import joblib
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.feature_extraction.text import TfidfVectorizer

from ml.train import train_from_csv


class TrainFromCsvTests(unittest.TestCase):
    def write_dataset(self, rows: list[tuple[str, str]]) -> str:
        tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(tmpdir.cleanup)
        path = Path(tmpdir.name) / "train.csv"
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["text", "label"])
            writer.writerows(rows)
        return str(path)

    def test_calibration_cv_is_capped_by_smallest_class(self) -> None:
        rows = [
            ("economy budget market taxes", "economy"),
            ("economy inflation investments", "economy"),
            ("economy bank finance growth", "economy"),
            ("economy export import business", "economy"),
            ("economy company startup market", "economy"),
            ("sports team player coach", "sports"),
            ("sports football league score", "sports"),
            ("sports olympic medals match", "sports"),
            ("sports tennis grand slam", "sports"),
            ("sports athlete training stadium", "sports"),
            ("tech ai machine learning", "tech"),
            ("tech gadgets mobile apps", "tech"),
        ]
        csv_path = self.write_dataset(rows)

        pipe, meta = train_from_csv(csv_path)

        self.assertTrue(meta["calibrated"])
        self.assertEqual(meta["calibration_cv"], 2)
        self.assertEqual(meta["min_samples_per_label"], 2)
        self.assertIsInstance(pipe.named_steps["clf"], CalibratedClassifierCV)

    def test_calibration_fits_vocabulary_only_on_each_training_fold(self) -> None:
        rows = [(f"economy budget uniqueeconomy{i}", "economy") for i in range(6)]
        rows += [(f"sports team uniquesports{i}", "sports") for i in range(6)]
        fitted_documents = []
        original = TfidfVectorizer.fit_transform

        def record_fit(vectorizer, documents, y=None):
            documents = list(documents)
            fitted_documents.append(documents)
            return original(vectorizer, documents, y)

        with mock.patch.object(TfidfVectorizer, "fit_transform", new=record_fit):
            csv_path = self.write_dataset(rows)
            pipe, meta = train_from_csv(csv_path)
        self.assertTrue(meta["calibrated"])
        self.assertEqual(len(fitted_documents), meta["calibration_cv"])
        self.assertTrue(all(0 < len(documents) < len(rows) for documents in fitted_documents),
                        "Vocabulary/IDF must not see calibration hold-out documents")
        self.assertEqual(meta["feature_fit_scope"], "calibration_training_fold")
        self.assertEqual(meta["input_sha256"], hashlib.sha256(Path(csv_path).read_bytes()).hexdigest())
        model_path = Path(csv_path).with_suffix(".joblib")
        joblib.dump(pipe, model_path)
        restored = joblib.load(model_path)  # Only this test's synthetic local artifact.
        probabilities = restored.predict_proba(["economy budget", "sports team"])
        self.assertEqual(probabilities.shape, (2, 2))
        for row in probabilities:
            self.assertAlmostEqual(sum(row), 1.0)

    def test_training_falls_back_to_plain_lr_when_a_class_has_one_sample(self) -> None:
        rows = [
            ("economy budget market taxes", "economy"),
            ("economy inflation investments", "economy"),
            ("economy bank finance growth", "economy"),
            ("economy export import business", "economy"),
            ("economy company startup market", "economy"),
            ("sports team player coach", "sports"),
            ("sports football league score", "sports"),
            ("sports olympic medals match", "sports"),
            ("sports tennis grand slam", "sports"),
            ("sports athlete training stadium", "sports"),
            ("tech ai machine learning", "tech"),
        ]
        csv_path = self.write_dataset(rows)

        pipe, meta = train_from_csv(csv_path)

        self.assertFalse(meta["calibrated"])
        self.assertIsNone(meta["calibration_cv"])
        self.assertEqual(meta["min_samples_per_label"], 1)
        self.assertIsInstance(pipe.named_steps["clf"], LogisticRegression)


if __name__ == "__main__":
    unittest.main()
