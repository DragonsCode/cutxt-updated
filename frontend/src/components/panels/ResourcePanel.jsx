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
  IconDatabase,
  IconDownload,
  IconFileText,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { getPageSlice, matchesSearch } from "../../utils/dashboard.js";
import { EmptyState, PanelSkeleton, TableFooter } from "./PanelPrimitives.jsx";

export function ResourcePanel({
  kind,
  items,
  loading,
  error,
  search = "",
  onAdd,
  onDownload,
  onDelete,
  onClassify,
  classifications = [],
  classificationError,
  initialFilter = "all",
  onRetry,
}) {
  const isDocument = kind === "document";
  const Icon = isDocument ? IconFileText : IconDatabase;
  const [sort, setSort] = useState("newest");
  const [filter, setFilter] = useState(initialFilter);
  const [pagination, setPagination] = useState({ key: "", page: 1 });
  const analyzedIds = useMemo(
    () => new Set(classifications.map((item) => item.document_id)),
    [classifications],
  );
  const filtered = useMemo(
    () =>
      items
        .filter(
          (item) =>
            matchesSearch(search, item.name, item.id) &&
            (!isDocument ||
              classificationError ||
              filter === "all" ||
              (filter === "analyzed"
                ? analyzedIds.has(item.id)
                : !analyzedIds.has(item.id))),
        )
        .sort((a, b) =>
          sort === "name" ? a.name.localeCompare(b.name, "ru") : b.id - a.id,
        ),
    [items, search, isDocument, filter, analyzedIds, sort, classificationError],
  );
  const pageKey = `${search}:${filter}:${sort}`;
  const slice = getPageSlice(
    filtered,
    pagination.key === pageKey ? pagination.page : 1,
  );
  return (
    <Paper className="dashboard-panel resource-panel">
      <div className="panel-heading">
        <div>
          <h2>
            {isDocument ? "Библиотека документов" : "Ваши эталонные базы"}
          </h2>
          <Text size="sm" c="dimmed">
            {isDocument
              ? "PDF, DOCX и тексты для классификации"
              : "Словари категорий в формате SQLite"}
          </Text>
        </div>
        <Button leftSection={<IconPlus size={17} />} onClick={onAdd}>
          {isDocument ? "Добавить документ" : "Загрузить базу"}
        </Button>
      </div>
      <div className="table-toolbar">
        <Group gap="sm">
          <Badge variant="light" color="gray">
            {error ? "Данные недоступны" : `${filtered.length} записей`}
          </Badge>
          {search && (
            <Text size="xs" c="dimmed">
              По запросу «{search}»
            </Text>
          )}
        </Group>
        <Group gap="sm">
          {isDocument && (
            <Select
              aria-label="Статус документа"
              value={filter}
              onChange={(value) => setFilter(value || "all")}
              data={[
                { value: "all", label: "Все документы" },
                { value: "pending", label: "Ожидают анализа" },
                { value: "analyzed", label: "Проанализированы" },
              ]}
              w={185}
              size="xs"
              allowDeselect={false}
              disabled={!!classificationError}
            />
          )}
          <Select
            aria-label="Сортировка записей"
            value={sort}
            onChange={(value) => setSort(value || "newest")}
            data={[
              { value: "newest", label: "Сначала новые" },
              { value: "name", label: "По названию" },
            ]}
            w={160}
            size="xs"
            allowDeselect={false}
          />
        </Group>
      </div>
      {loading ? (
        <PanelSkeleton />
      ) : error && !items.length ? (
        <EmptyState
          icon={Icon}
          title="Данные не загрузились"
          description={error}
          action="Повторить загрузку"
          onAction={onRetry}
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={Icon}
          title={
            items.length
              ? "Ничего не найдено"
              : isDocument
                ? "Начните с первого документа"
                : "Добавьте эталонную базу"
          }
          description={
            items.length
              ? "Попробуйте другой запрос или измените фильтр."
              : isDocument
                ? "Загрузите PDF или DOCX. Если текст уже под рукой, просто вставьте его."
                : "Загрузите .db или .sqlite с категориями и ключевыми словами."
          }
          action={
            !items.length
              ? isDocument
                ? "Добавить документ"
                : "Загрузить базу"
              : null
          }
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
                <Table.Th>Название</Table.Th>
                <Table.Th>{isDocument ? "Статус анализа" : "Формат"}</Table.Th>
                <Table.Th>ID</Table.Th>
                <Table.Th ta="right">Действия</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {slice.items.map((item) => (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <div className="resource-name">
                      <span
                        className={`file-icon ${isDocument ? "blue" : "purple"}`}
                      >
                        <Icon size={20} stroke={1.5} />
                      </span>
                      <Text fw={500} size="sm" lineClamp={2} title={item.name}>
                        {item.name}
                      </Text>
                    </div>
                  </Table.Td>
                  <Table.Td>
                    {isDocument ? (
                      <Badge
                        variant="light"
                        color={
                          !classificationError && analyzedIds.has(item.id)
                            ? "teal"
                            : "gray"
                        }
                        size="sm"
                      >
                        {classificationError
                          ? "Статус недоступен"
                          : analyzedIds.has(item.id)
                            ? "Проанализирован"
                            : "Ожидает анализа"}
                      </Badge>
                    ) : (
                      <Badge variant="light" color="gray" size="sm">
                        SQLite
                      </Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">
                      #{item.id}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={5} justify="flex-end" wrap="nowrap">
                      {isDocument && (
                        <Tooltip label="Анализировать">
                          <ActionIcon
                            variant="light"
                            onClick={() => onClassify(item.id)}
                            aria-label={`Анализировать документ ${item.name}`}
                          >
                            <IconArrowRight size={17} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      <Tooltip label="Скачать">
                        <ActionIcon
                          color="gray"
                          variant="subtle"
                          onClick={() =>
                            onDownload(
                              item.id,
                              isDocument ? item.name : `${item.name}.db`,
                            )
                          }
                          aria-label={`Скачать ${isDocument ? "документ" : "базу"} ${item.name}`}
                        >
                          <IconDownload size={17} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Удалить">
                        <ActionIcon
                          color="red"
                          variant="subtle"
                          onClick={() => onDelete(item.id)}
                          aria-label={`Удалить ${isDocument ? "документ" : "базу"} ${item.name}`}
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
      {!loading && (
        <TableFooter
          count={filtered.length}
          {...slice}
          onPageChange={(page) => setPagination({ key: pageKey, page })}
        />
      )}
    </Paper>
  );
}
