import unittest
from unittest import mock

import pandas as pd
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

import main
from models import Base, Classification, ClassifyRequest, Database, Document
from nlp.reference_db import ReferenceDBError


class ClassificationCacheTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine('sqlite:///:memory:')
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(engine)
        self.db = Session(engine)
        self.addCleanup(self.db.close)
        self.old_result = {'predicted_category': 'old', 'confidence': 1}
        self.db.add_all([
            Database(id=1, name='reference', file_path='unused.sqlite'),
            Document(id=1, name='example', text_content='Ўзбекистон Президентининг фармони'),
            Classification(id=7, document_id=1, database_id=1, classifier_method='dictionary', result=self.old_result),
        ])
        self.db.commit()

    def test_old_dictionary_cache_refreshes_without_changing_id(self):
        tables = pd.DataFrame([{'id': 1, 'name': 'Government'}])
        keys = pd.DataFrame([{'key': 'farmon', 'percent': 1, 'table_id': 1}])
        request = ClassifyRequest(document_id=1, database_id=1)
        with mock.patch.object(main, 'load_database', return_value=(tables, keys)) as load:
            updated = main.create_classification(request, self.db)
            cached = main.create_classification(request, self.db)
        self.assertEqual(updated['classification_id'], 7)
        self.assertEqual(updated['classification_result']['predicted_category'], 'Government')
        self.assertEqual(cached, updated)
        self.assertEqual(load.call_count, 1)

    def test_failed_recompute_preserves_previous_result(self):
        request = ClassifyRequest(document_id=1, database_id=1, force_recompute=True)
        with mock.patch.object(main, 'load_database', side_effect=ReferenceDBError('invalid database')):
            with self.assertRaises(HTTPException) as raised:
                main.create_classification(request, self.db)
        self.assertEqual(raised.exception.status_code, 400)
        self.db.expire_all()
        self.assertEqual(self.db.get(Classification, 7).result, self.old_result)

    def test_archive_results_use_reference_and_separate_cache(self):
        tables = pd.DataFrame([{'id': 1, 'name': 'Government'}])
        keys = pd.DataFrame([{'key': 'farmon', 'percent': 1, 'table_id': 1}])
        request = ClassifyRequest(document_id=1, database_id=1, method='structural')
        with mock.patch.object(main, 'load_database', return_value=(tables, keys)) as load:
            result = main.create_classification(request, self.db)
            cached = main.create_classification(request, self.db)
        self.assertEqual(result, cached)
        self.assertEqual(result['database_id'], 1)
        self.assertEqual(result['classifier_method'], 'structural')
        self.assertEqual(result['classification_result']['classifier_version'], 'archive-1.0')
        self.assertNotEqual(result['classification_id'], 7)
        self.assertEqual(load.call_count, 1)
        self.assertEqual(self.db.get(Classification, 7).result, self.old_result)


if __name__ == '__main__':
    unittest.main()
