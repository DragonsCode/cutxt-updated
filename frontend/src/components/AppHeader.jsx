import {
  AppShell,
  ActionIcon,
  Burger,
  TextInput,
  Tooltip,
  useMantineColorScheme,
} from "@mantine/core";
import {
  IconSearch,
  IconRefresh,
  IconSun,
  IconMoon,
  IconChevronRight,
  IconX,
} from "@tabler/icons-react";

export function AppHeader({
  pageLabel,
  search,
  onSearch,
  searchDisabled,
  onRefresh,
  refreshing,
  mobileOpened,
  onToggleMobile,
  connectionState,
}) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  return (
    <AppShell.Header className="dashboard-header">
      <div className="header-location">
        <Burger
          opened={mobileOpened}
          onClick={onToggleMobile}
          hiddenFrom="md"
          size="sm"
          aria-label={mobileOpened ? "Закрыть навигацию" : "Открыть навигацию"}
        />
        <span className="header-workspace">Пространство</span>
        <IconChevronRight size={14} className="header-workspace" />
        <strong>{pageLabel}</strong>
      </div>
      <div className="header-actions">
        <TextInput
          className="global-search"
          placeholder="Поиск в текущем разделе…"
          aria-label="Поиск в текущем разделе"
          disabled={searchDisabled}
          value={search}
          onChange={(event) => onSearch(event.currentTarget.value)}
          leftSection={<IconSearch size={17} />}
          rightSection={
            search ? (
              <ActionIcon
                size="xs"
                variant="subtle"
                color="gray"
                onClick={() => onSearch("")}
                aria-label="Очистить поиск"
              >
                <IconX size={13} />
              </ActionIcon>
            ) : null
          }
        />
        <Tooltip label="Обновить данные">
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onRefresh}
            loading={refreshing}
            aria-label="Обновить данные"
            size="lg"
          >
            <IconRefresh size={19} />
          </ActionIcon>
        </Tooltip>
        <Tooltip
          label={colorScheme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={toggleColorScheme}
            aria-label="Переключить тему"
            size="lg"
          >
            {colorScheme === "dark" ? (
              <IconSun size={19} />
            ) : (
              <IconMoon size={19} />
            )}
          </ActionIcon>
        </Tooltip>
        <span className="header-divider" />
        <span className={`connection-pill ${connectionState}`}>
          <span className="status-dot" />
          {connectionState === "loading"
            ? "Загрузка"
            : connectionState === "error"
              ? "Нет связи"
              : connectionState === "partial"
                ? "Частично"
                : "API онлайн"}
        </span>
      </div>
    </AppShell.Header>
  );
}
