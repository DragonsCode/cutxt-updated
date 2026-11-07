import { useState, useCallback, useEffect, useMemo } from "react";
import { AppShell, Alert, Button, Text } from "@mantine/core";
import { IconPlus, IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useDashboardData } from "./hooks/useDashboardData.js";
import { formatApiError } from "./api/client.js";
import {
  createDatabaseApi,
  createDocumentApi,
  createClassificationApi,
  deleteResource,
  downloadResourceBlob,
  fetchClassificationResult,
} from "./api/resources.js";
import { basenameNoExt, validateFileExtension } from "./utils/files.js";
import { saveBlobAsFile, getDownloadFilename } from "./utils/download.js";
import { AppHeader } from "./components/AppHeader.jsx";
import { DatabasesPanel } from "./components/panels/DatabasesPanel.jsx";
import { DocumentsPanel } from "./components/panels/DocumentsPanel.jsx";
import { ClassificationsPanel } from "./components/panels/ClassificationsPanel.jsx";
import { DatabaseModal } from "./components/modals/DatabaseModal.jsx";
import { DocumentModal } from "./components/modals/DocumentModal.jsx";
import { ClassifyModal } from "./components/modals/ClassifyModal.jsx";
import { ResultModal } from "./components/modals/ResultModal.jsx";
import { DashboardSidebar } from "./components/DashboardSidebar.jsx";
import { DashboardOverview } from "./components/DashboardOverview.jsx";
import { ModelsPanel } from "./components/panels/ModelsPanel.jsx";
import {
  enrichClassifications,
  getInitialPage,
  navigation,
} from "./utils/dashboard.js";

const initialForm = {
  dbName: "",
  dbFile: null,
  docName: "",
  docFile: null,
  docText: "",
  useText: false,
  classifyDocId: "",
  classifyDbId: "",
  classifyMethod: "dictionary",
  forceRecompute: false,
};

export default function App() {
  const {
    databases,
    documents,
    classifications,
    loading,
    errors: dataErrors,
    mlStatus,
    lastUpdated,
    refreshAll,
    refetchDatabases,
    refetchDocuments,
    refetchClassifications,
  } = useDashboardData();

  const [page, setPage] = useState(getInitialPage);
  const [search, setSearch] = useState("");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [mobileOpened, setMobileOpened] = useState(false);
  const pageInfo = navigation.find((item) => item.id === page);
  const results = useMemo(
    () => enrichClassifications(classifications, documents, databases),
    [classifications, documents, databases],
  );
  const refreshing = Object.values(loading).some(Boolean);
  const errorCount = Object.values(dataErrors).filter(Boolean).length;
  const connectionState = refreshing
    ? "loading"
    : errorCount === 4
      ? "error"
      : errorCount
        ? "partial"
        : "online";
  const mlAvailable = !!mlStatus?.available && !dataErrors.mlStatus;

  const [modal, setModal] = useState({
    db: false,
    doc: false,
    classify: false,
    result: false,
  });
  const [form, setForm] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState({
    db: false,
    doc: false,
    classify: false,
  });
  const [selectedResult, setSelectedResult] = useState(null);
  useEffect(() => {
    const onHashChange = () => {
      setPage(getInitialPage());
      setSearch("");
      setMobileOpened(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = (id, filter = "all") => {
    window.location.hash = id;
    setPage(id);
    setSearch("");
    setDocumentFilter(filter);
    setMobileOpened(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const closeModal = useCallback((key) => {
    setModal((m) => ({ ...m, [key]: false }));
    if (key !== "result") {
      setForm(initialForm);
      setFormErrors({});
    }
  }, []);

  const openModal = useCallback(
    (key) => {
      if (Object.values(submitting).some(Boolean)) return;
      setForm(initialForm);
      setFormErrors({});
      setModal({
        db: false,
        doc: false,
        classify: false,
        result: false,
        [key]: true,
      });
      setMobileOpened(false);
    },
    [submitting],
  );

  const startAnalysis = (documentId, method = "dictionary") => {
    if (Object.values(submitting).some(Boolean)) return;
    openModal("classify");
    setForm({
      ...initialForm,
      classifyDocId: documentId ? String(documentId) : "",
      classifyMethod: method,
    });
  };

  const clearFieldError = useCallback((field) => {
    setFormErrors((e) => {
      const next = { ...e };
      delete next[field];
      return next;
    });
  }, []);

  const submitDatabase = async () => {
    if (submitting.db) return;
    const err = {};
    if (!form.dbFile) err.dbFile = "Выберите файл эталонной базы";
    else if (!validateFileExtension(form.dbFile, ["db", "sqlite"]))
      err.dbFile = "Поддерживаются только .db и .sqlite";
    const title = form.dbName.trim() || basenameNoExt(form.dbFile);
    if (!title)
      err.dbName = "Укажите название или выберите файл с осмысленным именем";
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    setSubmitting((s) => ({ ...s, db: true }));
    try {
      await createDatabaseApi(title, form.dbFile);
      notifications.show({
        title: "Готово",
        message: "База загружена",
        color: "teal",
      });
      await refetchDatabases();
      closeModal("db");
    } catch (e) {
      notifications.show({
        title: "Ошибка",
        message: formatApiError(e),
        color: "red",
      });
    } finally {
      setSubmitting((s) => ({ ...s, db: false }));
    }
  };

  const submitDocument = async () => {
    if (submitting.doc) return;
    const err = {};
    if (form.useText) {
      if (!form.docText?.trim()) err.docText = "Введите текст документа";
      if (!form.docName.trim()) err.docName = "Укажите название для списка";
    } else {
      if (!form.docFile) err.docFile = "Выберите PDF или DOCX";
      else if (!validateFileExtension(form.docFile, ["pdf", "docx"]))
        err.docFile = "Поддерживаются только PDF и DOCX";
    }
    const title = form.useText
      ? form.docName.trim()
      : form.docName.trim() || basenameNoExt(form.docFile);
    if (!title)
      err.docName =
        "Нужно название (или оставьте поле пустым при выбранном файле)";
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    setSubmitting((s) => ({ ...s, doc: true }));
    try {
      await createDocumentApi(title, form.docFile, form.docText, form.useText);
      notifications.show({
        title: "Готово",
        message: "Документ добавлен",
        color: "teal",
      });
      await refetchDocuments();
      closeModal("doc");
    } catch (e) {
      notifications.show({
        title: "Ошибка",
        message: formatApiError(e),
        color: "red",
      });
    } finally {
      setSubmitting((s) => ({ ...s, doc: false }));
    }
  };

  const submitClassify = async () => {
    if (submitting.classify) return;
    const err = {};
    if (
      dataErrors.documents ||
      (form.classifyMethod !== "ml"
        ? dataErrors.databases
        : !mlAvailable)
    ) {
      notifications.show({
        title: "Анализ недоступен",
        message: "Обновите данные и проверьте доступность выбранного метода.",
        color: "orange",
      });
      return;
    }
    if (!form.classifyDocId) err.classifyDoc = "Выберите документ";
    if (form.classifyMethod !== "ml" && !form.classifyDbId) {
      err.classifyDb = "Выберите базу";
    }
    if (Object.keys(err).length) {
      setFormErrors(err);
      return;
    }
    setSubmitting((s) => ({ ...s, classify: true }));
    try {
      const payload = {
        document_id: parseInt(form.classifyDocId, 10),
        force_recompute: form.forceRecompute,
        method: form.classifyMethod,
      };
      if (form.classifyMethod !== "ml") {
        payload.database_id = parseInt(form.classifyDbId, 10);
      }
      const data = await createClassificationApi(payload);
      notifications.show({
        title: "Готово",
        message: "Классификация выполнена",
        color: "teal",
      });
      await refetchClassifications();
      setSelectedResult({
        ...data.classification_result,
        classification_kind: payload.method,
      });
      closeModal("classify");
      setModal((m) => ({ ...m, result: true }));
    } catch (e) {
      notifications.show({
        title: "Ошибка",
        message: formatApiError(e),
        color: "red",
      });
    } finally {
      setSubmitting((s) => ({ ...s, classify: false }));
    }
  };

  const onDelete = (endpoint, id, refresh) => {
    modals.openConfirmModal({
      title: "Удалить запись?",
      children: <Text size="sm">Действие необратимо. Продолжить?</Text>,
      labels: { confirm: "Удалить", cancel: "Отмена" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        try {
          await deleteResource(endpoint, id);
          notifications.show({
            title: "Удалено",
            message: "Запись удалена",
            color: "gray",
          });
          await refresh();
        } catch (e) {
          notifications.show({
            title: "Ошибка",
            message: formatApiError(e),
            color: "red",
          });
        }
      },
    });
  };

  const onDownload = async (endpoint, id, filename) => {
    try {
      const res = await downloadResourceBlob(endpoint, id);
      saveBlobAsFile(res.data, getDownloadFilename(res.data, filename));
    } catch (e) {
      notifications.show({
        title: "Ошибка скачивания",
        message: formatApiError(e),
        color: "red",
      });
    }
  };

  const onViewResult = async (id) => {
    try {
      const result = await fetchClassificationResult(id);
      setSelectedResult(result);
      setModal((m) => ({ ...m, result: true }));
    } catch (e) {
      notifications.show({
        title: "Ошибка",
        message: formatApiError(e),
        color: "red",
      });
    }
  };

  const closeResult = () => {
    setModal((m) => ({ ...m, result: false }));
    setSelectedResult(null);
  };

  const classificationProps = {
    formState: form,
    setFormState: setForm,
    documents,
    databases,
    mlAvailable,
    onSubmit: submitClassify,
    submitting: submitting.classify,
    errors: formErrors,
    onClearError: clearFieldError,
    dataUnavailable:
      !!dataErrors.documents ||
      (form.classifyMethod !== "ml"
        ? !!dataErrors.databases
        : !!dataErrors.mlStatus),
  };
  const resultProps = {
    items: results,
    loading: loading.classifications,
    error: dataErrors.classifications,
    search,
    onAdd: () => startAnalysis(),
    onView: onViewResult,
    onDelete: (id) => onDelete("classify", id, refetchClassifications),
    onRetry: refetchClassifications,
  };

  return (
    <AppShell
      layout="alt"
      header={{ height: 76 }}
      navbar={{
        width: 252,
        breakpoint: "md",
        collapsed: { mobile: !mobileOpened },
      }}
      padding={0}
      className="dashboard-shell"
    >
      <DashboardSidebar
        page={page}
        onNavigate={navigate}
        onAddDocument={() => openModal("doc")}
        counts={{
          documents:
            dataErrors.documents || loading.documents ? null : documents.length,
          databases:
            dataErrors.databases || loading.databases ? null : databases.length,
          results:
            dataErrors.classifications || loading.classifications
              ? null
              : classifications.length,
        }}
        mlStatus={mlStatus}
        connectionError={dataErrors.mlStatus}
      />
      <AppHeader
        pageLabel={pageInfo.label}
        search={search}
        onSearch={setSearch}
        searchDisabled={page === "models"}
        onRefresh={refreshAll}
        refreshing={refreshing}
        mobileOpened={mobileOpened}
        onToggleMobile={() => setMobileOpened((value) => !value)}
        connectionState={connectionState}
      />
      <AppShell.Main>
        <div className="dashboard-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">CU TXT / РАБОЧЕЕ ПРОСТРАНСТВО</div>
              <h1>
                {page === "overview"
                  ? "Ваши тексты. В полном порядке."
                  : pageInfo.label}
              </h1>
              <p>{pageInfo.description}</p>
            </div>
            {page === "overview" && (
              <Button
                leftSection={<IconPlus size={17} />}
                onClick={() => openModal("doc")}
              >
                Добавить документ
              </Button>
            )}
          </div>
          {errorCount > 0 && (
            <Alert
              className="connection-alert"
              icon={<IconAlertCircle size={20} />}
              color="orange"
              title={
                errorCount === 4
                  ? "Не удалось подключиться к API"
                  : "Часть данных не удалось обновить"
              }
            >
              <div className="connection-alert-content">
                <span>
                  {Object.entries(dataErrors)
                    .filter(([, error]) => error)
                    .map(
                      ([key]) =>
                        ({
                          documents: "Документы",
                          databases: "Эталонные базы",
                          classifications: "История анализа",
                          mlStatus: "Статус ML-модели",
                        })[key],
                    )
                    .join(", ")}
                  . {Object.values(dataErrors).find(Boolean)}
                </span>
                <Button
                  size="xs"
                  color="orange"
                  variant="light"
                  leftSection={<IconRefresh size={14} />}
                  onClick={refreshAll}
                  loading={refreshing}
                >
                  Повторить
                </Button>
              </div>
            </Alert>
          )}
          {page === "overview" && (
            <DashboardOverview
              databases={databases}
              documents={documents}
              classifications={classifications}
              results={results}
              loading={loading}
              errors={dataErrors}
              mlStatus={mlStatus}
              onNavigate={navigate}
              onAddDocument={() => openModal("doc")}
              onAddDatabase={() => openModal("db")}
              classificationProps={classificationProps}
              resultProps={resultProps}
            />
          )}
          {page === "databases" && (
            <DatabasesPanel
              items={databases}
              loading={loading.databases}
              error={dataErrors.databases}
              search={search}
              onRetry={refetchDatabases}
              onAdd={() => openModal("db")}
              onDownload={(id, name) => onDownload("database", id, name)}
              onDelete={(id) => onDelete("database", id, refetchDatabases)}
            />
          )}
          {page === "documents" && (
            <DocumentsPanel
              key={documentFilter}
              initialFilter={documentFilter}
              items={documents}
              loading={loading.documents}
              error={dataErrors.documents}
              search={search}
              classifications={classifications}
              classificationError={dataErrors.classifications}
              onRetry={refetchDocuments}
              onClassify={startAnalysis}
              onAdd={() => openModal("doc")}
              onDownload={(id, name) => onDownload("document", id, name)}
              onDelete={(id) => onDelete("document", id, refetchDocuments)}
            />
          )}
          {page === "results" && <ClassificationsPanel {...resultProps} />}
          {page === "models" && (
            <ModelsPanel
              mlStatus={mlStatus}
              loading={loading.mlStatus}
              error={dataErrors.mlStatus}
              databaseCount={dataErrors.databases ? 0 : databases.length}
              onAddDatabase={() => openModal("db")}
              onRefresh={refreshAll}
              onAnalyze={(method) => startAnalysis(null, method)}
            />
          )}
          <footer className="dashboard-footer">
            <span>
              CuTxT <span>·</span> Пространство для осмысленной работы с текстом
            </span>
            <span>
              {lastUpdated
                ? `Обновлено в ${lastUpdated.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`
                : "Ожидаем данные"}
            </span>
          </footer>
        </div>
      </AppShell.Main>

      <DatabaseModal
        opened={modal.db}
        onClose={() => closeModal("db")}
        formState={form}
        setFormState={setForm}
        onSubmit={submitDatabase}
        submitting={submitting.db}
        errors={formErrors}
        onClearError={clearFieldError}
      />
      <DocumentModal
        opened={modal.doc}
        onClose={() => closeModal("doc")}
        formState={form}
        setFormState={setForm}
        onSubmit={submitDocument}
        submitting={submitting.doc}
        errors={formErrors}
        onClearError={clearFieldError}
      />
      <ClassifyModal
        opened={modal.classify}
        onClose={() => closeModal("classify")}
        formState={form}
        setFormState={setForm}
        documents={documents}
        databases={databases}
        mlAvailable={mlAvailable}
        onSubmit={submitClassify}
        submitting={submitting.classify}
        errors={formErrors}
        onClearError={clearFieldError}
        dataUnavailable={classificationProps.dataUnavailable}
      />
      <ResultModal
        opened={modal.result}
        onClose={closeResult}
        selectedResult={selectedResult}
      />
    </AppShell>
  );
}
