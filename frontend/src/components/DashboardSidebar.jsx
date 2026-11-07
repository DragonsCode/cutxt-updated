import { AppShell, Button, Text } from "@mantine/core";
import {
  IconLayoutDashboard,
  IconFiles,
  IconDatabase,
  IconHistory,
  IconCpu,
  IconArrowUpRight,
  IconPlus,
  IconBraces,
} from "@tabler/icons-react";
import { navigation } from "../utils/dashboard.js";

const icons = {
  overview: IconLayoutDashboard,
  documents: IconFiles,
  databases: IconDatabase,
  results: IconHistory,
  models: IconCpu,
};

export function DashboardSidebar({
  page,
  onNavigate,
  onAddDocument,
  counts,
  mlStatus,
  connectionError,
}) {
  return (
    <AppShell.Navbar className="dashboard-sidebar" p={0}>
      <a
        className="brand"
        href="#overview"
        onClick={() => onNavigate("overview")}
        aria-label="CuTxT — обзор"
      >
        <span className="brand-mark">
          <IconBraces size={25} stroke={2} />
        </span>
        <span>
          CuTxT<span className="brand-caption">TEXT INTELLIGENCE</span>
        </span>
      </a>
      <div className="sidebar-content">
        <div className="workspace-label">
          <span className="workspace-avatar">C</span>
          <div>
            Рабочее пространство<small>Классификация документов</small>
          </div>
        </div>
        <Text className="nav-caption">РАБОТА С ТЕКСТАМИ</Text>
        <nav aria-label="Основная навигация" className="sidebar-nav">
          {navigation.map((item) => {
            const Icon = icons[item.id];
            return (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => onNavigate(item.id)}
                aria-current={page === item.id ? "page" : undefined}
              >
                <Icon size={20} stroke={1.7} />
                <span>{item.label}</span>
                {counts[item.id] != null && (
                  <span className="nav-count">{counts[item.id]}</span>
                )}
              </button>
            );
          })}
        </nav>
        <Button
          fullWidth
          leftSection={<IconPlus size={18} />}
          onClick={onAddDocument}
          className="sidebar-add"
        >
          Добавить документ
        </Button>
      </div>
      <div className="sidebar-bottom">
        <button className="sidebar-tip" onClick={() => onNavigate("models")}>
          <span className="tip-icon">
            <IconCpu size={22} />
          </span>
          <strong>Выберите метод анализа</strong>
          <span>
            Словарь, структура документа или ML — выберите метод для своей задачи.
          </span>
          <span className="tip-link">
            О методах анализа <IconArrowUpRight size={16} />
          </span>
        </button>
        <div className="sidebar-status">
          <span
            className={`status-dot ${connectionError ? "warning" : mlStatus?.available ? "" : "muted"}`}
          />
          <span>
            {connectionError
              ? "Статус недоступен"
              : mlStatus == null
                ? "Проверяем модель…"
                : mlStatus.available
                  ? "ML-модель подключена"
                  : "Эталонный метод"}
          </span>
        </div>
      </div>
    </AppShell.Navbar>
  );
}
