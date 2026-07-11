import type { DemoScenario, EngineStatus } from "../types";
import { AppMark, Icon } from "./Icons";
import { StatusPill, type StatusTone } from "./StatusPill";

export type AppView = "dashboard" | "settings";

interface HeaderProps {
  view: AppView;
  engineStatus: EngineStatus;
  onViewChange: (view: AppView) => void;
  demoMode?: boolean;
  demoScenario?: DemoScenario;
  onDemoScenarioChange?: (scenario: DemoScenario) => void;
}

const enginePresentation: Record<
  EngineStatus,
  { label: string; tone: StatusTone; pulse?: boolean }
> = {
  ready: { label: "Gotowy", tone: "success" },
  busy: { label: "Operacja w toku", tone: "warning", pulse: true },
  error: { label: "Wymaga uwagi", tone: "danger" },
  offline: { label: "Niedostępny", tone: "neutral" },
};

export function Header({
  view,
  engineStatus,
  onViewChange,
  demoMode = false,
  demoScenario = "dashboard",
  onDemoScenarioChange,
}: HeaderProps) {
  const engine = enginePresentation[engineStatus];

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="brand" aria-label="Antigravity Account Switcher">
          <AppMark />
          <div className="brand__text">
            <span className="brand__name">Antigravity</span>
            <span className="brand__product">Account Switcher</span>
          </div>
        </div>

        <nav aria-label="Główna nawigacja" className="top-navigation">
          <button
            aria-current={view === "dashboard" ? "page" : undefined}
            className={`nav-button ${view === "dashboard" ? "nav-button--active" : ""}`}
            onClick={() => onViewChange("dashboard")}
            type="button"
          >
            <Icon name="accounts" size={16} />
            <span>Konta</span>
          </button>
          <button
            aria-current={view === "settings" ? "page" : undefined}
            className={`nav-button ${view === "settings" ? "nav-button--active" : ""}`}
            onClick={() => onViewChange("settings")}
            type="button"
          >
            <Icon name="settings" size={16} />
            <span>Ustawienia</span>
          </button>
        </nav>

        <div className="header-actions">
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
                <option value="dashboard">Demo: konta</option>
                <option value="empty">Demo: pusty stan</option>
                <option value="progress">Demo: postęp</option>
                <option value="recovery">Demo: recovery</option>
                <option value="error">Demo: błąd</option>
              </select>
            </label>
          ) : null}
          <StatusPill tone={engine.tone} pulse={engine.pulse} className="engine-pill">
            {engine.label}
          </StatusPill>
        </div>
      </div>
    </header>
  );
}
