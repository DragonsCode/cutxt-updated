import { Alert, Badge, Button, Paper, Text } from "@mantine/core";
import {
  IconBook2,
  IconCpu,
  IconArrowRight,
  IconRefresh,
  IconFileAnalytics,
} from "@tabler/icons-react";
import { PanelSkeleton } from "./PanelPrimitives.jsx";

export function ModelsPanel({
  mlStatus,
  loading,
  error,
  databaseCount,
  onAddDatabase,
  onRefresh,
  onAnalyze,
}) {
  return (
    <div className="models-grid">
      <Paper className="dashboard-panel model-card">
        <span className="model-icon teal">
          <IconBook2 size={29} stroke={1.5} />
        </span>
        <Badge color={databaseCount ? "teal" : "gray"} variant="light">
          {databaseCount ? "Готов к работе" : "Нужна эталонная база"}
        </Badge>
        <h2>Эталонный словарь</h2>
        <p>
          Классификация по словам и фразам из вашей базы. Используйте этот
          метод, когда документ нужно отнести к папкам или категориям,
          заданным в базе SQLite.
        </p>
        <dl>
          <dt>Источник категорий</dt>
          <dd>Ваша база SQLite</dd>
          <dt>Оценка результата</dt>
          <dd>Доля баллов категории</dd>
          <dt>Обучение модели</dt>
          <dd>Не требуется</dd>
        </dl>
        <Alert variant="light" color="teal">
          Оценка показывает долю совпадений с эталоном и не является
          вероятностью класса.
        </Alert>
        <Button
          mt="lg"
          variant="light"
          rightSection={<IconArrowRight size={16} />}
          onClick={
            databaseCount ? () => onAnalyze("dictionary") : onAddDatabase
          }
        >
          {databaseCount ? "Начать анализ" : "Загрузить эталонную базу"}
        </Button>
      </Paper>
      <Paper className="dashboard-panel model-card">
        <span className="model-icon teal"><IconFileAnalytics size={29} stroke={1.5} /></span>
        <Badge color={databaseCount ? "blue" : "gray"} variant="light">
          {databaseCount ? "Готов к работе" : "Нужна эталонная база"}
        </Badge>
        <h2>Архивный анализ</h2>
        <p>Для документов с заголовком и приложениями. Учитывает место совпадения, общие слова и повторения.</p>
        <dl>
          <dt>Категории</dt><dd>Папки из вашей базы</dd>
          <dt>Заголовок</dt><dd>Больший вклад в оценку</dd>
          <dt>Спорное решение</dt><dd>Метка ручной проверки</dd>
        </dl>
        <Alert variant="light" color="blue">Экспериментальный метод. Сравните его со словарём на документах с известной папкой.</Alert>
        <Button mt="lg" variant="light" rightSection={<IconArrowRight size={16} />}
          onClick={databaseCount ? () => onAnalyze("structural") : onAddDatabase}>
          {databaseCount ? "Начать архивный анализ" : "Загрузить эталонную базу"}
        </Button>
      </Paper>
      <Paper className="dashboard-panel model-card">
        <span className="model-icon purple">
          <IconCpu size={29} stroke={1.5} />
        </span>
        {loading ? (
          <PanelSkeleton />
        ) : (
          <>
            <Badge
              color={error ? "orange" : mlStatus?.available ? "teal" : "gray"}
              variant="light"
            >
              {error
                ? "Статус недоступен"
                : mlStatus?.available
                  ? "Модель подключена"
                  : "Модель не подключена"}
            </Badge>
            <h2>Машинное обучение</h2>
            <p>
              {mlStatus?.dataset
                ? "Модель общих тем на узбекских новостных текстах. Принимает латиницу и кириллицу."
                : "Классификация с помощью обученной модели. Категории и качество прогнозов зависят от обучающего набора."}
            </p>
            <dl>
              <dt>Тип модели</dt>
              <dd>{mlStatus?.backend || "—"}</dd>
              <dt>Версия</dt>
              <dd>{mlStatus?.model_version ?? "—"}</dd>
              <dt>Категорий</dt>
              <dd>
                {mlStatus?.labels?.length ?? mlStatus?.classes?.length ?? "—"}
              </dd>
              {mlStatus?.training_samples != null && (
                <>
                  <dt>Текстов для обучения</dt>
                  <dd>{mlStatus.training_samples.toLocaleString("ru-RU")}</dd>
                </>
              )}
              {mlStatus?.test_metrics && (
                <>
                  <dt>Точность на тесте</dt>
                  <dd>{(mlStatus.test_metrics.accuracy * 100).toFixed(1)}%</dd>
                  <dt>Macro F1</dt>
                  <dd>{mlStatus.test_metrics.macro_f1.toFixed(3)}</dd>
                </>
              )}
            </dl>
            {mlStatus?.available && mlStatus?.labels?.length > 0 && (
              <Text size="sm" mb="md" c="dimmed">
                {mlStatus.labels.join(" · ")}
              </Text>
            )}
            {error ? (
              <Alert color="orange">{error}</Alert>
            ) : !mlStatus?.available ? (
              <Alert color="violet" variant="light">
                Для подключения сохраните обученную модель на сервере и
                перезапустите API. После подключения метод появится в быстром
                анализе.
              </Alert>
            ) : (
              <Alert color="violet" variant="light">
                ML-оценка — вероятность категории по модели. Эталонная база для
                этого метода не нужна.
                {mlStatus?.dataset && (
                  <>
                  <Text size="sm" mt="xs">
                    Модель определяет общие темы. Для сортировки по папкам
                    вашей базы выберите эталонный словарь.
                  </Text>
                  <Text size="sm" mt="xs">
                    Качество измерено на новостях. Для ваших документов нужна
                    отдельная проверка. Кириллица обрабатывается через транслитерацию.
                  </Text>
                  </>
                )}
              </Alert>
            )}
            <Button
              mt="lg"
              variant="light"
              leftSection={
                mlStatus?.available ? (
                  <IconArrowRight size={16} />
                ) : (
                  <IconRefresh size={16} />
                )
              }
              onClick={mlStatus?.available ? () => onAnalyze("ml") : onRefresh}
            >
              {mlStatus?.available
                ? "Начать ML-анализ"
                : "Проверить подключение"}
            </Button>
          </>
        )}
      </Paper>
    </div>
  );
}
