import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowRight,
  IconEye,
  IconFileText,
  IconHistory,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { formatRelativeShare } from "../../utils/classification.js";
import { getPageSlice, matchesSearch } from "../../utils/dashboard.js";
import { EmptyState, PanelSkeleton, TableFooter } from "./PanelPrimitives.jsx";

export function ClassificationsPanel({
  items,
  loading,
  error,
  search = "",
  onAdd,
  onView,
  onDelete,
  onViewAll,
  onRetry,
  compact = false,
}) {
  const [method, setMethod] = useState("all");
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (method === "all" || item.method === method) &&
          matchesSearch(
            search,
            item.documentName,
            item.databaseName,
            item.category,
            item.classification_id,
            item.method === "ml" ? "ML" : item.method === "structural" ? "Архивный анализ" : "Словарь",
            item.classification_result?.needs_review ? "Проверить вручную" : "",
          ),
      ),
    [items, method, search],
  );
  const key = `${search}:${method}`;
  const pageSize = compact ? 5 : 8;
  const slice = getPageSlice(
    filtered,
    compact || pagination.key !== key ? 1 : pagination.page,
    pageSize,
  );
  return (
    <Paper className="dashboard-panel results-panel">
      <div className="panel-heading">
        <div>
          <h2>
            {compact ? "Последние результаты" : "Результаты классификации"}
          </h2>
          <Text size="sm" c="dimmed">
            {compact
              ? "Последние выполненные анализы"
              : "Сравнивайте категории и открывайте подробные оценки"}
          </Text>
        </div>
        {compact ? (
          <Button
            size="xs"
            variant="subtle"
            rightSection={<IconArrowRight size={15} />}
            onClick={onViewAll}
          >
            Вся история
          </Button>
        ) : (
          <Button leftSection={<IconPlus size={17} />} onClick={onAdd}>
            Новый анализ
          </Button>
        )}
      </div>
      {!compact && (
        <div className="table-toolbar">
          <Badge variant="light" color="gray">
            {error ? "Данные недоступны" : `${filtered.length} результатов`}
          </Badge>
          <Select
            aria-label="Метод в истории анализа"
            value={method}
            onChange={(value) => setMethod(value || "all")}
            allowDeselect={false}
            data={[
              { value: "all", label: "Все методы" },
              { value: "dictionary", label: "Эталонный словарь" },
              { value: "structural", label: "Архивный анализ" },
              { value: "ml", label: "ML-модель" },
            ]}
            size="xs"
            w={190}
          />
        </div>
      )}
      {loading ? (
        <PanelSkeleton />
      ) : error && !items.length ? (
        <EmptyState
          icon={IconHistory}
          title="История недоступна"
          description={error}
          action="Повторить загрузку"
          onAction={onRetry}
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={IconHistory}
          title={
            items.length
              ? "Результаты не найдены"
              : "Здесь появятся ваши результаты"
          }
          description={
            items.length
              ? "Измените поисковый запрос или выбранный метод."
              : "Выберите документ и метод, запустите анализ — результат сохранится в истории."
          }
          action={items.length ? null : "Новый анализ"}
          onAction={onAdd}
        />
      ) : (
        <div className="table-scroll">
          <Table
            className="data-table"
            verticalSpacing="md"
            horizontalSpacing="lg"
            highlightOnHover
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Документ</Table.Th>
                <Table.Th>Категория</Table.Th>
                <Table.Th>Метод</Table.Th>
                <Table.Th>Оценка</Table.Th>
                <Table.Th ta="right">Действия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {slice.items.map((item) => (
                <Table.Tr key={item.classification_id}>
                  <Table.Td>
                    <div className="resource-name">
                      <span className="file-icon blue">
                        <IconFileText size={19} stroke={1.5} />
                      </span>
                      <div>
                        <Text
                          size="sm"
                          fw={500}
                          lineClamp={1}
                          title={item.documentName}
                        >
                          {item.documentName}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          #{item.classification_id} · {item.databaseName}
                        </Text>
                      </div>
                    </div>
                  </Table.Td>
                  <Table.Td>
                    <span
                      className={`category-label ${item.category === "Unknown" ? "unknown" : ""}`}
                    >
                      {item.category === "Unknown"
                        ? "Не определена"
                        : item.category}
                    </span>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      size="sm"
                      variant="light"
                      color={item.method === "ml" ? "violet" : item.method === "structural" ? "blue" : "teal"}
                    >
                      {item.method === "ml" ? "ML" : item.method === "structural" ? "Архив" : "Словарь"}
                    </Badge>
                    {item.classification_result?.needs_review && (
                      <Text size="xs" c="orange" mt={4}>Проверить вручную</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Tooltip
                      multiline
                      w={240}
                      label={
                        item.method === "ml"
                          ? "Вероятность класса, оцененная моделью"
                          : "Доля баллов лидирующей категории. Это не вероятность."
                      }
                    >
                      <span className="score-value">
                        {formatRelativeShare(item.share)}
                      </span>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={5} justify="flex-end" wrap="nowrap">
                      <Tooltip label="Открыть результат">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() => onView(item.classification_id)}
                          aria-label={`Открыть результат классификации ${item.classification_id}`}
                        >
                          <IconEye size={18} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Удалить">
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => onDelete(item.classification_id)}
                          aria-label={`Удалить классификацию ${item.classification_id}`}
                        >
                          <IconTrash size={17} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      )}
      {!loading && !compact && (
        <TableFooter
          count={filtered.length}
          {...slice}
          onPageChange={(page) => setPagination({ key, page })}
        />
      )}
    </Paper>
  );
}
