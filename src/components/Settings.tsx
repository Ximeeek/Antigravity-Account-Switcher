import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppSettings, AppState, ExtensionStatus } from "../types";
import { Icon } from "./Icons";
import { StatusPill, type StatusTone } from "./StatusPill";

interface SettingsProps {
  state: AppState;
  workingAction?: string | null;
  onSave: (settings: AppSettings) => Promise<void>;
  onInstallExtension: () => Promise<void>;
  onCopyDiagnostics: () => Promise<void>;
}

const extensionPresentation: Record<
  ExtensionStatus,
  { label: string; tone: StatusTone; action: string }
> = {
  installed: { label: "Zainstalowana", tone: "success", action: "Reinstaluj" },
  not_installed: { label: "Niezainstalowana", tone: "neutral", action: "Zainstaluj" },
  update_available: { label: "Dostępna aktualizacja", tone: "warning", action: "Aktualizuj" },
  error: { label: "Wymaga uwagi", tone: "danger", action: "Napraw instalację" },
};

export function Settings({
  state,
  workingAction,
  onSave,
  onInstallExtension,
  onCopyDiagnostics,
}: SettingsProps) {
  const [draft, setDraft] = useState<AppSettings>(state.settings);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => setDraft(state.settings), [state.settings]);

  const dirty = useMemo(
    () =>
      draft.http_port !== state.settings.http_port ||
      draft.antigravity_path.trim() !== state.settings.antigravity_path.trim(),
    [draft, state.settings],
  );

  const extension = extensionPresentation[state.extension.status];
  const saving = workingAction === "settings";
  const installing = workingAction === "extension";
  const copying = workingAction === "diagnostics";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.http_port < 1024 || draft.http_port > 65535) {
      setValidationError("Port musi być liczbą od 1024 do 65535.");
      return;
    }
    if (!draft.antigravity_path.trim()) {
      setValidationError("Podaj ścieżkę do pliku Antigravity.exe.");
      return;
    }
    setValidationError(null);
    await onSave({ ...draft, antigravity_path: draft.antigravity_path.trim() });
  };

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Konfiguracja lokalna</p>
          <h1>Ustawienia</h1>
          <p>Zarządzaj połączeniem, wtyczką i bezpieczną diagnostyką.</p>
        </div>
        <div className="version-stack" aria-label="Wersje aplikacji">
          <span>Switcher {state.app_version ?? "—"}</span>
          <span>Antigravity {state.antigravity_version ?? "—"}</span>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card settings-card--server" aria-labelledby="server-heading">
          <div className="settings-card__header">
            <div className="settings-card__icon settings-card__icon--blue">
              <Icon name="server" />
            </div>
            <div>
              <h2 id="server-heading">Serwer lokalny</h2>
              <p>Połączenie wtyczki z aplikacją desktopową.</p>
            </div>
            <StatusPill tone="success">127.0.0.1</StatusPill>
          </div>

          <form className="settings-form" onSubmit={handleSubmit}>
            <div className="field-row field-row--port">
              <label className="field" htmlFor="http-port">
                <span className="field__label">Port HTTP</span>
                <input
                  aria-describedby={validationError ? "settings-validation" : "port-hint"}
                  id="http-port"
                  inputMode="numeric"
                  max={65535}
                  min={1024}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      http_port: Number(event.target.value),
                    }))
                  }
                  type="number"
                  value={Number.isNaN(draft.http_port) ? "" : draft.http_port}
                />
              </label>
              <p className="field-hint" id="port-hint">
                Dostępny wyłącznie lokalnie. Zmiana może wymagać ponownego połączenia wtyczki.
              </p>
            </div>

            <label className="field" htmlFor="antigravity-path">
              <span className="field__label">Ścieżka instalacji Antigravity</span>
              <span className="path-input-wrap">
                <Icon name="folder" size={17} />
                <input
                  autoComplete="off"
                  id="antigravity-path"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      antigravity_path: event.target.value,
                    }))
                  }
                  spellCheck={false}
                  type="text"
                  value={draft.antigravity_path}
                />
              </span>
            </label>

            {validationError ? (
              <p className="field-error" id="settings-validation" role="alert">
                <Icon name="error" size={16} />
                {validationError}
              </p>
            ) : null}

            <div className="settings-form__actions">
              <span className="unsaved-status" aria-live="polite">
                {dirty ? "Masz niezapisane zmiany" : "Ustawienia są aktualne"}
              </span>
              <button
                className="button button--primary"
                disabled={!dirty || saving}
                type="submit"
              >
                {saving ? <Icon name="loader" size={16} /> : <Icon name="check" size={16} />}
                <span>{saving ? "Zapisywanie…" : "Zapisz zmiany"}</span>
              </button>
            </div>
          </form>
        </section>

        <section className="settings-card" aria-labelledby="extension-heading">
          <div className="settings-card__header settings-card__header--stackable">
            <div className="settings-card__icon settings-card__icon--violet">
              <Icon name="extension" />
            </div>
            <div>
              <h2 id="extension-heading">Wtyczka Antigravity</h2>
              <p>Thin client wyświetlający aktywne konto w edytorze.</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="extension-state">
              <div>
                <StatusPill tone={extension.tone}>{extension.label}</StatusPill>
                <span className="extension-version">
                  {state.extension.version ? `Wersja ${state.extension.version}` : "Brak informacji o wersji"}
                </span>
              </div>
              <button
                className="button button--secondary"
                disabled={installing}
                onClick={onInstallExtension}
                type="button"
              >
                <Icon name={installing ? "loader" : "refresh"} size={16} />
                <span>{installing ? "Instalowanie…" : extension.action}</span>
              </button>
            </div>
            {state.extension.message ? (
              <div className="compact-alert compact-alert--danger" role="status">
                <Icon name="alert" size={16} />
                <span>{state.extension.message}</span>
              </div>
            ) : null}
          </div>
        </section>

        <section className="settings-card" aria-labelledby="diagnostics-heading">
          <div className="settings-card__header settings-card__header--stackable">
            <div className="settings-card__icon settings-card__icon--cyan">
              <Icon name="copy" />
            </div>
            <div>
              <h2 id="diagnostics-heading">Diagnostyka</h2>
              <p>Gotowy, zanonimizowany raport do zgłoszenia problemu.</p>
            </div>
          </div>
          <div className="settings-card__body settings-card__body--actions">
            <ul className="plain-check-list">
              <li><Icon name="check" size={15} /> Ostatnie zdarzenia i wersje aplikacji</li>
              <li><Icon name="check" size={15} /> Wykryte ścieżki bez sekretów</li>
              <li><Icon name="shield" size={15} /> Tokeny i adresy e-mail są pomijane</li>
            </ul>
            <button
              className="button button--secondary button--full"
              disabled={copying}
              onClick={onCopyDiagnostics}
              type="button"
            >
              <Icon name={copying ? "loader" : "copy"} size={16} />
              <span>{copying ? "Kopiowanie…" : "Kopiuj dziennik diagnostyczny"}</span>
            </button>
          </div>
        </section>

        <section className="settings-card settings-card--privacy" aria-labelledby="privacy-heading">
          <div className="settings-card__header settings-card__header--stackable">
            <div className="settings-card__icon settings-card__icon--green">
              <Icon name="shield" />
            </div>
            <div>
              <h2 id="privacy-heading">Prywatność profili</h2>
              <p>Dane kont pozostają na tym komputerze.</p>
            </div>
          </div>
          <div className="privacy-visual" aria-hidden="true">
            <span className="privacy-node"><Icon name="user" size={16} /></span>
            <span className="privacy-line" />
            <span className="privacy-node privacy-node--shield"><Icon name="shield" size={18} /></span>
            <span className="privacy-line" />
            <span className="privacy-node"><Icon name="folder" size={16} /></span>
          </div>
          <p className="settings-card__note">
            Profile są identyfikowane losowym UUID. Dane uwierzytelniające nie trafiają do logów.
          </p>
        </section>
      </div>
    </div>
  );
}
