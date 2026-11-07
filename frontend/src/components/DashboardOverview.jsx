import { Badge, Button, Paper, Progress, Skeleton, Text } from "@mantine/core";
import {
  IconArrowUpRight,
  IconArrowRight,
  IconCheck,
  IconDatabase,
  IconFiles,
  IconHistory,
  IconHourglass,
  IconPlus,
  IconBolt,
  IconCpu,
} from "@tabler/icons-react";
import { getDocumentProgress } from "../utils/dashboard.js";
import { ClassificationForm } from "./ClassificationForm.jsx";
import { ClassificationsPanel } from "./panels/ClassificationsPanel.jsx";

export function DashboardOverview({
  databases,
  documents,
  classifications,
  results,
  loading,
  errors,
  mlStatus,
  onNavigate,
  onAddDocument,
  onAddDatabase,
  classificationProps,
  resultProps,
}) {
  const progress = getDocumentProgress(documents, classifications);
  const progressUnavailable = errors.documents || errors.classifications;
  const stats = [
    {
      title: "Документы",
      value: documents.length,
      caption: "В вашем пространстве",
      icon: IconFiles,
      color: "blue",
      page: "documents",
      loading: loading.documents,
      error: errors.documents,
    },
    {
      title: "Эталонные базы",
      value: databases.length,
      caption: "Словари для сравнения",
      icon: IconDatabase,
      color: "purple",
      page: "databases",
      loading: loading.databases,
      error: errors.databases,
    },
    {
      title: "Выполнено анализов",
      value: classifications.length,
      caption: "Сохранено в истории",
      icon: IconHistory,
      color: "teal",
      page: "results",
      loading: loading.classifications,
      error: errors.classifications,
    },
    {
      title: "Ожидают анализа",
      filter: "pending",
      value: progress.pending,
      caption: "Документы без результата",
      icon: IconHourglass,
      color: "orange",
      page: "documents",
      loading: loading.documents || loading.classifications,
      error: progressUnavailable,
    },
  ];
  const steps = [
    {
      title: "Добавьте документ",
      text: "PDF, DOCX или обычный текст",
      done: documents.length > 0,
      onClick: onAddDocument,
    },
    {
      title: "Подготовьте метод",
      text: "Эталонная база или ML-модель",
      done: databases.length > 0 || mlStatus?.available,
      onClick:
        databases.length > 0 || mlStatus?.available
          ? () => onNavigate("models")
          : onAddDatabase,
    },
    {
      title: "Запустите анализ",
      text: "Получите категорию и оценки",
      done: classifications.length > 0,
      onClick: () =>
        document
          .getElementById("quick-analysis")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    },
  ];
  return (
    <>
      <div className="stat-grid">
        {stats.map(
          ({
            title,
            value,
            caption,
            icon: Icon,
            color,
            page,
            filter,
            loading: isLoading,
            error,
          }) => (
            <button
              className={`stat-card ${color}`}
              key={title}
              onClick={() => onNavigate(page, filter)}
            >
              <div className="stat-top">
                <span>{title}</span>
                <span className="stat-icon">
                  <Icon size={21} stroke={1.6} />
                </span>
              </div>
              {isLoading ? (
                <Skeleton h={34} w={70} my={9} />
              ) : (
                <strong className="stat-value">
                  {error ? "—" : value.toLocaleString("ru")}
                </strong>
              )}
              <div className="stat-bottom">
                <span>{error ? "Данные недоступны" : caption}</span>
                <IconArrowUpRight size={16} />
              </div>
            </button>
          ),
        )}
      </div>
      <div className="overview-grid">
        <Paper className="dashboard-panel quick-analysis" id="quick-analysis">
          <div className="panel-heading">
            <div className="panel-title-with-icon">
              <span className="panel-icon">
                <IconBolt size={20} />
              </span>
              <div>
                <h2>Быстрый анализ</h2>
                <Text size="sm" c="dimmed">
                  От документа к категории за один шаг
                </Text>
              </div>
            </div>
            <Badge color="teal" variant="light" size="sm">
              {classificationProps.submitting ? "Обработка" : "Новый анализ"}
            </Badge>
          </div>
          <ClassificationForm
            {...classificationProps}
            onAddDocument={onAddDocument}
            onAddDatabase={onAddDatabase}
          />
        </Paper>
        <Paper className="dashboard-panel getting-started">
          <div className="panel-heading">
            <div>
              <h2>Всё готово к работе?</h2>
              <Text size="sm" c="dimmed">
                Три простых шага
              </Text>
            </div>
          </div>
          <div className="setup-steps">
            {steps.map((step, index) => (
              <button
                className={`setup-step ${step.done ? "done" : ""}`}
                key={step.title}
                onClick={step.onClick}
              >
                <span className="step-number">
                  {step.done ? (
                    <IconCheck size={16} />
                  ) : (
                    String(index + 1).padStart(2, "0")
                  )}
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <small>{step.text}</small>
                </span>
                <IconArrowRight size={16} className="step-arrow" />
              </button>
            ))}
          </div>
          <div className="progress-summary">
            <div>
              <span>Документы с результатом</span>
              <strong>
                {progressUnavailable
                  ? "—"
                  : `${progress.analyzed} / ${documents.length}`}
              </strong>
            </div>
            <Progress
              value={
                progressUnavailable || !documents.length
                  ? 0
                  : (progress.analyzed / documents.length) * 100
              }
              color="teal"
              size={5}
              aria-label="Доля проанализированных документов"
            />
          </div>
          <Button
            variant="light"
            color="gray"
            fullWidth
            leftSection={<IconPlus size={16} />}
            onClick={onAddDocument}
          >
            Добавить документ
          </Button>
        </Paper>
      </div>
      <div className="overview-bottom">
        <ClassificationsPanel
          {...resultProps}
          items={results}
          compact
          onViewAll={() => onNavigate("results")}
        />
        <Paper className="method-summary">
          <div className="method-summary-top">
            <span className="method-summary-icon">
              <IconCpu size={24} stroke={1.5} />
            </span>
            <span className="eyebrow">МЕТОДЫ АНАЛИЗА</span>
          </div>
          <h2>
            Точность начинается
            <br />с правильного метода.
          </h2>
          <p>
            Словарь находит знакомые термины. ML-модель определяет категорию по
            обученным закономерностям.
          </p>
          <div className="method-summary-status">
            <span
              className={`status-dot ${errors.mlStatus ? "warning" : mlStatus?.available ? "" : "muted"}`}
            />
            {errors.mlStatus
              ? "Статус модели недоступен"
              : loading.mlStatus
                ? "Проверяем ML-модель…"
                : mlStatus?.available
                  ? "ML-модель готова к работе"
                  : "ML-модель не подключена"}
          </div>
          <button onClick={() => onNavigate("models")}>
            Подробнее о методах <IconArrowUpRight size={17} />
          </button>
        </Paper>
      </div>
    </>
  );
}
