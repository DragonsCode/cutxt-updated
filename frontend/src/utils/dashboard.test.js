import test from "node:test";
import assert from "node:assert/strict";
import {
  enrichClassifications,
  getDocumentProgress,
  getPageSlice,
  matchesSearch,
} from "./dashboard.js";
import {
  formatRelativeShare,
  interpretClassification,
  scoreRowsForDisplay,
} from "./classification.js";
import { getDownloadFilename } from "./download.js";
import { validateFileExtension } from "./files.js";

test("search matches all terms across names and categories regardless of case", () => {
  assert.equal(
    matchesSearch("  ОТЧЁТ   финансы ", "Годовой отчёт", "Финансы"),
    true,
  );
  assert.equal(
    matchesSearch("отчёт договор", "Годовой отчёт", "Финансы"),
    false,
  );
  assert.equal(matchesSearch("", null, undefined), true);
});

test("history resolves resource names, keeps legacy results, and handles deleted resources", () => {
  const rows = enrichClassifications(
    [
      {
        classification_id: 2,
        document_id: 1,
        database_id: 9,
        classification_result: {
          predicted_category: "Отчёт",
          confidence: 0.75,
        },
      },
      {
        classification_id: 4,
        document_id: 99,
        database_id: -1,
        classifier_method: "ml",
        classification_result: {
          predicted_category: "Договор",
          relative_score_share: 0.9,
        },
      },
      { classification_id: 3, document_id: 1, database_id: 2 },
    ],
    [{ id: 1, name: "Годовой отчёт" }],
    [{ id: 2, name: "Эталон" }],
  );
  assert.deepEqual(
    rows.map((row) => row.classification_id),
    [4, 3, 2],
  );
  assert.equal(rows[0].documentName, "Документ #99");
  assert.equal(rows[0].databaseName, "ML-модель");
  assert.equal(rows[1].databaseName, "Эталон");
  assert.equal(rows[2].documentName, "Годовой отчёт");
  assert.equal(rows[2].databaseName, "База #9");
  assert.equal(rows[2].share, 0.75);
});

test("document progress counts distinct existing documents rather than total analyses", () => {
  assert.deepEqual(
    getDocumentProgress(
      [{ id: 1 }, { id: 2 }],
      [{ document_id: 1 }, { document_id: 1 }, { document_id: 9 }],
    ),
    { analyzed: 1, pending: 1 },
  );
  assert.deepEqual(getDocumentProgress([], []), { analyzed: 0, pending: 0 });
});

test("archive history preserves reference and review information", () => {
  const [row] = enrichClassifications([
    { classification_id: 8, document_id: 1, database_id: 2,
      classifier_method: "structural",
      classification_result: { predicted_category: "Папка 1", relative_score_share: 0.52, needs_review: true } },
  ], [{ id: 1, name: "Приказ" }], [{ id: 2, name: "Архив" }]);
  assert.equal(row.method, "structural");
  assert.equal(row.databaseName, "Архив");
  assert.equal(row.classification_result.needs_review, true);
  assert.equal(row.share, 0.52);
});

test("pagination remains valid after filtering or deleting the last page", () => {
  const rows = Array.from({ length: 9 }, (_, id) => id);
  assert.deepEqual(getPageSlice(rows, 2).items, [8]);
  assert.equal(getPageSlice(rows.slice(0, 8), 2).currentPage, 1);
  assert.deepEqual(getPageSlice([], 5), {
    items: [],
    totalPages: 1,
    currentPage: 1,
  });
});

test("result scores are ordered with the leader first and retain raw values", () => {
  const rows = scoreRowsForDisplay({ all_scores_by_name: { Б: 10, А: 30 } });
  assert.deepEqual(
    rows.map((row) => row.category),
    ["А", "Б"],
  );
  assert.equal(rows[0].share, 0.75);
  assert.equal(rows[0].raw, 30);
  assert.equal(
    scoreRowsForDisplay({ all_scores: { 1: 2, 2: 5 } })[0].category,
    "2",
  );
});

test("zero-match results are not described as a single scoring class", () => {
  assert.equal(
    interpretClassification({ all_scores_by_name: { А: 0, Б: 0 } }).onlyOne,
    false,
  );
  assert.equal(
    interpretClassification({ all_scores_by_name: { А: 1, Б: 0 } }).onlyOne,
    true,
  );
  assert.equal(formatRelativeShare(Infinity), "—");
  assert.equal(formatRelativeShare(0.75), "75.0 %");
  assert.match(formatRelativeShare(12), /старый формат/);
});

test("downloads preserve PDF, DOCX, and text extensions without duplication", () => {
  assert.equal(
    getDownloadFilename({ type: "application/pdf" }, "Отчёт"),
    "Отчёт.pdf",
  );
  assert.equal(
    getDownloadFilename({ type: "text/plain; charset=utf-8" }, "Текст"),
    "Текст.txt",
  );
  assert.equal(
    getDownloadFilename({ type: "application/pdf" }, "ОТЧЁТ.PDF"),
    "ОТЧЁТ.PDF",
  );
});

test("upload validation accepts supported extensions regardless of case", () => {
  assert.equal(
    validateFileExtension({ name: "Отчёт.PDF" }, ["pdf", "docx"]),
    true,
  );
  assert.equal(
    validateFileExtension({ name: "Отчёт.pdf.exe" }, ["pdf", "docx"]),
    false,
  );
  assert.equal(validateFileExtension(null, ["pdf"]), false);
});
