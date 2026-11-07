import {
  Button,
  Group,
  Pagination,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconSearch, IconArrowRight } from "@tabler/icons-react";

export function EmptyState({
  icon: Icon = IconSearch,
  title,
  description,
  action,
  onAction,
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={29} stroke={1.4} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <Button
          variant="light"
          size="sm"
          rightSection={<IconArrowRight size={16} />}
          onClick={onAction}
        >
          {action}
        </Button>
      )}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <Stack p="xl" gap="lg" aria-label="Загрузка данных">
      <Skeleton h={18} w="45%" />
      {[1, 2, 3].map((key) => (
        <Skeleton key={key} h={40} radius="sm" />
      ))}
    </Stack>
  );
}

export function TableFooter({
  count,
  currentPage,
  totalPages,
  onPageChange,
  pageSize = 8,
}) {
  return (
    <Group className="table-footer" justify="space-between">
      <Text size="xs" c="dimmed">
        {count
          ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, count)} из ${count}`
          : "0 записей"}
      </Text>
      {totalPages > 1 && (
        <Pagination
          size="sm"
          total={totalPages}
          value={currentPage}
          onChange={onPageChange}
          getControlProps={(control) => ({
            "aria-label": {
              first: "Первая страница",
              last: "Последняя страница",
              next: "Следующая страница",
              previous: "Предыдущая страница",
            }[control],
          })}
        />
      )}
    </Group>
  );
}
