import { Alert, Button, Select, Switch, Text } from "@mantine/core";
import {
  IconBook2,
  IconCpu,
  IconPlayerPlay,
  IconPlus,
  IconArrowRight,
  IconFileAnalytics,
} from "@tabler/icons-react";

export function ClassificationForm({
  formState,
  setFormState,
  documents,
  databases,
  mlAvailable,
  onSubmit,
  submitting,
  errors = {},
  onClearError,
  onAddDocument,
  onAddDatabase,
  compact = false,
  dataUnavailable = false,
}) {
  const needsReference = formState.classifyMethod !== "ml";
  const canClassify =
    !dataUnavailable &&
    documents.length > 0 &&
    (needsReference ? databases.length > 0 : mlAvailable);
  const selectOptions = (items) =>
    items.map((item) => ({ value: String(item.id), label: item.name }));
  const updateField = (field, errorField, value) => {
    onClearError?.(errorField);
    setFormState((previous) => ({ ...previous, [field]: value || "" }));
  };
  return (
    <form
      className={`classification-form ${compact ? "compact" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div
        className="method-picker"
        role="group"
        aria-label="Метод классификации"
      >
        {[
          {
            id: "structural",
            title: "Архивный анализ",
            description: "Заголовок, текст и приложения",
            icon: IconFileAnalytics,
          },
          {
            id: "dictionary",
            title: "Эталонный словарь",
            description: "Совпадения с вашей базой",
            icon: IconBook2,
          },
          {
            id: "ml",
            title: "ML-модель",
            description: mlAvailable
              ? "Обученная модель"
              : "Модель не подключена",
            icon: IconCpu,
          },
        ].map(({ id, title, description, icon: Icon }) => (
          <button
            key={id}
            type="button"
            disabled={submitting}
            className={`method-option ${formState.classifyMethod === id ? "selected" : ""}`}
            aria-pressed={formState.classifyMethod === id}
            onClick={() => {
              onClearError?.("classifyDb");
              setFormState((previous) => ({ ...previous, classifyMethod: id }));
            }}
          >
            <Icon size={23} stroke={1.6} />
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
            <span className="method-radio" />
          </button>
        ))}
      </div>
      <div className="classify-fields">
        <div>
          <Select
            label="Документ для анализа"
            placeholder="Выберите документ"
            data={selectOptions(documents)}
            value={formState.classifyDocId || null}
            onChange={(value) =>
              updateField("classifyDocId", "classifyDoc", value)
            }
            disabled={submitting || !documents.length}
            error={errors.classifyDoc}
            searchable
            nothingFoundMessage="Документ не найден"
            leftSection={<IconBook2 size={17} />}
          />
          {onAddDocument && (
            <button
              type="button"
              className="field-link"
              onClick={onAddDocument}
            >
              <IconPlus size={13} />
              Добавить документ
            </button>
          )}
        </div>
        {needsReference ? (
          <div>
            <Select
              label="Эталонная база"
              placeholder="Выберите базу"
              data={selectOptions(databases)}
              value={formState.classifyDbId || null}
              onChange={(value) =>
                updateField("classifyDbId", "classifyDb", value)
              }
              disabled={submitting || !databases.length}
              error={errors.classifyDb}
              searchable
              nothingFoundMessage="База не найдена"
              leftSection={<IconBook2 size={17} />}
            />
            {onAddDatabase && (
              <button
                type="button"
                className="field-link"
                onClick={onAddDatabase}
              >
                <IconPlus size={13} />
                Загрузить базу
              </button>
            )}
          </div>
        ) : (
          <div className="ml-selection-note">
            <IconCpu size={23} />
            <span>
              {mlAvailable ? "Модель готова к анализу" : "ML-модель недоступна"}
              <small>
                {mlAvailable
                  ? "Эталонная база не требуется"
                  : "Подключите обученную модель на сервере"}
              </small>
            </span>
          </div>
        )}
      </div>
      {!dataUnavailable && !canClassify && (
        <Alert color="gray" variant="light" className="form-note">
          {!documents.length
            ? "Добавьте первый документ: загрузите PDF / DOCX или вставьте текст."
            : needsReference
              ? "Загрузите эталонную базу, чтобы запустить словарный анализ."
              : "Выберите эталонный словарь или подключите ML-модель."}
        </Alert>
      )}
      {dataUnavailable && (
        <Alert color="orange" variant="light">
          Не удалось загрузить данные для анализа. Обновите их и повторите
          попытку.
        </Alert>
      )}
      <div className="classify-footer">
        <Switch
          size="sm"
          label="Пересчитать результат"
          description="Если документ уже анализировался"
          checked={formState.forceRecompute}
          disabled={submitting}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            setFormState((previous) => ({
              ...previous,
              forceRecompute: checked,
            }));
          }}
        />
        <Button
          type="submit"
          loading={submitting}
          disabled={!canClassify}
          leftSection={<IconPlayerPlay size={16} />}
          rightSection={<IconArrowRight size={16} />}
        >
          Запустить анализ
        </Button>
      </div>
      {submitting && (
        <Text size="xs" c="dimmed" role="status">
          Документ обрабатывается. Это может занять некоторое время…
        </Text>
      )}
    </form>
  );
}
