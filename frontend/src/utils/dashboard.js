import { interpretClassification } from "./classification.js";

export const navigation = [
  {
    id: "overview",
    label: "Обзор",
    description: "Всё для работы с текстами — в одном месте.",
  },
  {
    id: "documents",
    label: "Документы",
    description:
      "Загружайте файлы и тексты, находите нужное и запускайте анализ.",
  },
  {
    id: "databases",
    label: "Эталонные базы",
    description: "Управляйте словарями, с которыми сравниваются документы.",
  },
  {
    id: "results",
    label: "История анализа",
    description:
      "Результаты классификации, категории и оценки по каждому документу.",
  },
  {
    id: "models",
    label: "Модель и методы",
    description: "Доступность методов и сведения об активной ML-модели.",
  },
];

export function getInitialPage() {
  const id = window.location.hash.slice(1);
  return navigation.some((item) => item.id === id) ? id : "overview";
}

export function matchesSearch(query, ...values) {
  const terms = query
    .trim()
    .toLocaleLowerCase("ru")
    .split(/\s+/)
    .filter(Boolean);
  const haystack = values
    .filter((value) => value != null)
    .join(" ")
    .toLocaleLowerCase("ru");
  return terms.every((term) => haystack.includes(term));
}

export function enrichClassifications(items, documents, databases) {
  const documentNames = new Map(documents.map((item) => [item.id, item.name]));
  const databaseNames = new Map(databases.map((item) => [item.id, item.name]));
  return items
    .map((item) => {
      const result = item.classification_result || {};
      const method =
        item.classifier_method || result.classification_kind || "dictionary";
      return {
        ...item,
        method,
        documentName:
          documentNames.get(item.document_id) ||
          `Документ #${item.document_id}`,
        databaseName:
          method === "ml"
            ? "ML-модель"
            : databaseNames.get(item.database_id) ||
              `База #${item.database_id}`,
        category: result.predicted_category || "Unknown",
        share: interpretClassification(result).share,
      };
    })
    .sort((a, b) => b.classification_id - a.classification_id);
}

export function getDocumentProgress(documents, classifications) {
  const analyzedIds = new Set(classifications.map((item) => item.document_id));
  const analyzed = documents.filter((item) => analyzedIds.has(item.id)).length;
  return { analyzed, pending: documents.length - analyzed };
}

export function getPageSlice(items, page, pageSize = 8) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  return {
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    totalPages,
    currentPage,
  };
}
