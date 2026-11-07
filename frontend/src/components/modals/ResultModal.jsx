import {
  Modal,
  Button,
  Stack,
  Group,
  Text,
  Table,
  ScrollArea,
  Alert,
  Title,
  Badge,
  Progress,
} from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import {
  formatRelativeShare,
  interpretClassification,
  scoreRowsForDisplay,
} from "../../utils/classification.js";
import { saveBlobAsFile } from "../../utils/download.js";

export function ResultModal({ opened, onClose, selectedResult }) {
  const meta =
    selectedResult != null ? interpretClassification(selectedResult) : null;
  const isMl = selectedResult?.classification_kind === "ml";
  const isArchive = selectedResult?.classification_kind === "structural";
  const scoreRows = selectedResult ? scoreRowsForDisplay(selectedResult) : [];
  const winningKeywords = (selectedResult?.matched_keywords ?? [])
    .filter((row) => row.category_id === selectedResult.predicted_category_id)
    .slice(0, 6);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Результат классификации"
      radius="lg"
      size="lg"
      centered
    >
      {selectedResult && meta && (
        <Stack gap="md">
          <Group gap="sm">
            <Badge color={isMl ? "grape" : "blue"} variant="light">
              {isMl ? "ML" : isArchive ? "Архивный анализ" : "Словарь"}
            </Badge>
            {isMl && selectedResult.model_version && (
              <Text size="xs" c="dimmed">
                модель v{selectedResult.model_version}
                {selectedResult.calibrated ? " · калибровка" : ""}
              </Text>
            )}
          </Group>
          <div className="result-hero">
            <Text size="sm" c="dimmed" mb={4}>
              {isMl ? "Предсказанный класс" : isArchive ? "Папка по структуре документа" : "Категория по словарю"}
            </Text>
            <Group justify="space-between">
              <Title order={3}>
                {selectedResult.predicted_category === "Unknown"
                  ? "Категория не определена"
                  : selectedResult.predicted_category}
              </Title>
              <span className="result-share">
                {formatRelativeShare(meta.share)}
              </span>
            </Group>
          </div>
          {isArchive && (
            <Alert color={selectedResult.needs_review ? "orange" : "blue"} variant="light">
              <Text size="sm" fw={600}>
                {selectedResult.needs_review ? "Нужна ручная проверка" : "Учтена структура документа"}
              </Text>
              {selectedResult.needs_review ? selectedResult.review_reasons?.join(" ") :
                "В заголовке есть характерные ключи. Приложения и частые повторы влияют слабее основного текста."}
            </Alert>
          )}
          {isMl ? (
            <Text size="sm" c="dimmed">
              <Text span inherit fw={600}>
                Вероятность лучшего класса:{" "}
              </Text>
              {formatRelativeShare(meta.share)} — оценка из{" "}
              {selectedResult.calibrated ? "калиброванной " : ""}
              модели.
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              <Text span inherit fw={600}>
                Доля баллов лидирующей категории:{" "}
              </Text>
              {formatRelativeShare(meta.share)} — доля суммарного сырого скора
              по совпадениям в эталоне, не вероятность класса.
            </Text>
          )}
          {selectedResult.predicted_category === "Unknown" && (
            <Alert color="gray" variant="light">
              Категория не определена. Проверьте содержимое документа и
              выбранный метод анализа.
            </Alert>
          )}
          {meta.onlyOne && !isMl && (
            <Alert color="yellow" variant="light">
              Только один класс набрал ненулевой скор по словарю. Высокая доля
              не означает абсолютную уверенность — нет второго кандидата.
            </Alert>
          )}
          {meta.onlyOne && isMl && (
            <Alert color="yellow" variant="light">
              Остальные классы почти с нулевой вероятностью — смотрите таблицу
              ниже.
            </Alert>
          )}
          {!meta.onlyOne && meta.marginRaw != null && (
            <Text size="sm">
              <Text span fw={600}>
                Разница со второй категорией:
              </Text>{" "}
              {isMl
                ? `по вероятности — ${Number(meta.marginRaw).toFixed(4)}`
                : `по сырому скору — ${Number(meta.marginRaw).toFixed(2)}`}
              {meta.marginShare != null && (
                <>
                  ; по доле — {(Number(meta.marginShare) * 100).toFixed(1)} п.п.
                </>
              )}
              {meta.runnerUp && <> (второй: «{meta.runnerUp}»)</>}
            </Text>
          )}
          <Text size="xs" c="dimmed">
            {isMl
              ? "Таблица показывает оценки категорий по обученной модели."
              : isArchive
                ? "Баллы учитывают место совпадения, повторения, длину фразы и размер словаря папки. Это не вероятность."
                : "«Сырой балл» — сумма percent×weight по совпадениям в эталонном словаре."}
          </Text>
          <ScrollArea
            h={Math.min(320, 48 + scoreRows.length * 53)}
            type="auto"
            offsetScrollbars
          >
            <Table
              striped
              highlightOnHover
              verticalSpacing="xs"
              withTableBorder
              withColumnBorders
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{isMl ? "Класс" : "Категория"}</Table.Th>
                  <Table.Th ta="right">
                    {isMl ? "Вероятность" : "Доля"}
                  </Table.Th>
                  <Table.Th ta="right">
                    {isMl ? "Значение P" : "Баллы"}
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {scoreRows.map((row) => (
                  <Table.Tr key={row.category}>
                    <Table.Td maw={360}>
                      <Text size="sm" lineClamp={4}>
                        {row.category}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      {row.share != null && !Number.isNaN(row.share)
                        ? `${(row.share * 100).toFixed(1)} %`
                        : "—"}
                      {row.share != null && Number.isFinite(row.share) && (
                        <Progress
                          value={Math.max(0, Math.min(100, row.share * 100))}
                          size={4}
                          mt={5}
                          color={isMl ? "indigo" : "teal"}
                        />
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text size="sm" c="dimmed" ff="monospace">
                        {Number(row.raw).toFixed(isMl ? 4 : 2)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
          {!isMl && winningKeywords.length > 0 && (
            <div>
              <Text size="sm" fw={600} mb="xs">
                Основные совпадения с выбранной категорией
              </Text>
              <Text size="xs" c="dimmed" mb="xs">
                {isArchive ? "Количество совпадений по зонам и фрагменты нормализованного текста." :
                  "Учтены ключевые фразы, латиница, кириллица и типовые узбекские окончания."}
              </Text>
              <Table verticalSpacing="xs" withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ключ из базы</Table.Th>
                    {isArchive ? (
                      <>
                        <Table.Th ta="right">Загол.</Table.Th>
                        <Table.Th ta="right">Текст</Table.Th>
                        <Table.Th ta="right">Прил.</Table.Th>
                      </>
                    ) : <Table.Th ta="right">Совпадений</Table.Th>}
                    <Table.Th ta="right">Баллы</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {winningKeywords.map((row, index) => (
                    <Table.Tr key={`${row.key}-${index}`}>
                      <Table.Td>
                        {row.key}
                        {isArchive && row.excerpts && (
                          <Text size="xs" c="dimmed" mt={3}>
                            {row.excerpts.header || row.excerpts.body || row.excerpts.appendix}
                          </Text>
                        )}
                      </Table.Td>
                      {isArchive ? (
                        <>
                          <Table.Td ta="right">{row.zones?.header ?? 0}</Table.Td>
                          <Table.Td ta="right">{row.zones?.body ?? 0}</Table.Td>
                          <Table.Td ta="right">{row.zones?.appendix ?? 0}</Table.Td>
                        </>
                      ) : <Table.Td ta="right">{row.occurrences}</Table.Td>}
                      <Table.Td ta="right">{Number(row.score).toFixed(2)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          )}
          <Group justify="space-between">
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={() =>
                saveBlobAsFile(
                  new Blob([JSON.stringify(selectedResult, null, 2)], {
                    type: "application/json",
                  }),
                  "classification-result.json",
                )
              }
            >
              Экспорт JSON
            </Button>
            <Button onClick={onClose} variant="light">
              Закрыть
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
