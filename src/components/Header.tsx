import type { DemoScenario, EngineStatus } from "../types";
import { AppMark, Icon } from "./Icons";
import { StatusPill, type StatusTone } from "./StatusPill";
import { t } from "../i18n";

export type AppView = "dashboard" | "settings";

interface HeaderProps {
  view: AppView;
  engineStatus: EngineStatus;
  onViewChange: (view: AppView) => void;
  onBrandClick?: () => void;
  demoMode?: boolean;
  demoScenario?: DemoScenario;
  onDemoScenarioChange?: (scenario: DemoScenario) => void;
  onOpenMini?: () => void;
}

const enginePresentation: Record<
  EngineStatus,
  { tone: StatusTone; pulse?: boolean }
> = {
  ready: { tone: "success" },
  busy: { tone: "warning", pulse: true },
  error: { tone: "danger" },
  offline: { tone: "neutral" },
};

export function Header({
  view,
  engineStatus,
  onViewChange,
  onBrandClick,
  demoMode = false,
  demoScenario = "dashboard",
  onDemoScenarioChange,
  onOpenMini,
}: HeaderProps) {
  const engine = enginePresentation[engineStatus];
  const engineLabels: Record<EngineStatus, string> = {
    ready: t("engine_ready"),
    busy: t("engine_busy"),
    error: t("engine_error"),
    offline: t("engine_offline"),
  };

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <button
          className="brand brand-button"
          onClick={onBrandClick ?? (() => onViewChange("dashboard"))}
          aria-label={t("brand_title_attr")}
          title={t("brand_title_attr")}
        >
          <AppMark />
          <div className="brand__text">
            <span className="brand__name">{t("brand_name")}</span>
            <span className="brand__product">{t("brand_product")}</span>
          </div>
        </button>

        <nav aria-label="Główna nawigacja" className="top-navigation">
          <button
            aria-current={view === "dashboard" ? "page" : undefined}
            className={`nav-button ${view === "dashboard" ? "nav-button--active" : ""}`}
            onClick={() => onViewChange("dashboard")}
            type="button"
          >
            <Icon name="accounts" size={16} />
            <span>{t("nav_accounts")}</span>
          </button>
          <button
            aria-current={view === "settings" ? "page" : undefined}
            className={`nav-button ${view === "settings" ? "nav-button--active" : ""}`}
            onClick={() => onViewChange("settings")}
            type="button"
          >
            <Icon name="settings" size={16} />
            <span>{t("nav_settings")}</span>
          </button>
        </nav>

        <div className="header-actions">
          {onOpenMini && (
            <button
              className="button button--secondary button--small"
              onClick={onOpenMini}
              title={t("open_mini")}
              type="button"
            >
              <Icon name="mini" size={14} />
              <span>{t("mini_mode")}</span>
            </button>
          )}
          {demoMode && onDemoScenarioChange ? (
            <label className="demo-selector">
              <span className="sr-only">Scenariusz demonstracyjny</span>
              <select
                aria-label="Scenariusz demonstracyjny"
                onChange={(event) =>
                  onDemoScenarioChange(event.target.value as DemoScenario)
                }
                value={demoScenario}
              >
                <option value="dashboard">{t("demo_accounts")}</option>
                <option value="empty">{t("demo_empty")}</option>
                <option value="progress">{t("demo_progress")}</option>
                <option value="recovery">{t("demo_recovery")}</option>
                <option value="error">{t("demo_error")}</option>
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </header>
  );
}
