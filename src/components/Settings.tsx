import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppSettings, AppState, ExtensionStatus } from "../types";
import { Icon } from "./Icons";
import { StatusPill, type StatusTone } from "./StatusPill";
import { t, getLanguage, type Language } from "../i18n";

interface SettingsProps {
  state: AppState;
  workingAction?: string | null;
  onSave: (settings: AppSettings) => Promise<void>;
  onInstallExtension: () => Promise<void>;
  onCopyDiagnostics: () => Promise<void>;
  onLanguageChange: (lang: Language) => void;
}

export function Settings({
  state,
  workingAction,
  onSave,
  onInstallExtension,
  onCopyDiagnostics,
  onLanguageChange,
}: SettingsProps) {
  const extensionPresentation: Record<
    ExtensionStatus,
    { label: string; tone: StatusTone; action: string }
  > = {
    installed: { label: t("extension_installed_pill"), tone: "success", action: t("extension_action_reinstall") },
    not_installed: { label: t("extension_not_installed_pill"), tone: "neutral", action: t("extension_action_install") },
    update_available: { label: t("extension_update_pill"), tone: "warning", action: t("extension_action_update") },
    error: { label: t("extension_error_pill"), tone: "danger", action: t("extension_action_repair") },
  };
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
          <p className="eyebrow">{t("settings_eyebrow")}</p>
          <h1>{t("settings_title")}</h1>
          <p>{t("settings_desc")}</p>
        </div>
        <div className="version-stack" aria-label={t("versions")}>
          <span>{t("settings_switcher_ver", { version: state.app_version ?? "—" })}</span>
          <span>{t("settings_antigravity_ver", { version: state.antigravity_version ?? "—" })}</span>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card settings-card--server" aria-labelledby="server-heading">
          <div className="settings-card__header">
            <div className="settings-card__icon settings-card__icon--blue">
              <Icon name="server" />
            </div>
            <div>
              <h2 id="server-heading">{t("server_title")}</h2>
              <p>{t("server_desc")}</p>
            </div>
            <StatusPill tone="success">127.0.0.1</StatusPill>
          </div>

          <form className="settings-form" onSubmit={handleSubmit}>
            <div className="field-row field-row--port">
              <label className="field" htmlFor="http-port">
                <span className="field__label">{t("port_label")}</span>
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
                {t("port_hint")}
              </p>
            </div>

            <label className="field" htmlFor="antigravity-path">
              <span className="field__label">{t("path_label")}</span>
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
                {dirty ? t("unsaved_changes") : t("settings_up_to_date")}
              </span>
              <button
                className="button button--primary"
                disabled={!dirty || saving}
                type="submit"
              >
                {saving ? <Icon name="loader" size={16} /> : <Icon name="check" size={16} />}
                <span>{saving ? t("saving") : t("save_changes")}</span>
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
              <h2 id="extension-heading">{t("extension_title")}</h2>
              <p>{t("extension_desc")}</p>
            </div>
          </div>
          <div className="settings-card__body">
            <div className="extension-state">
              <div>
                <StatusPill tone={extension.tone}>{extension.label}</StatusPill>
                <span className="extension-version">
                  {state.extension.version ? t("extension_version", { version: state.extension.version }) : t("extension_no_version")}
                </span>
              </div>
              <button
                className="button button--secondary"
                disabled={installing}
                onClick={onInstallExtension}
                type="button"
              >
                <Icon name={installing ? "loader" : "refresh"} size={16} />
                <span>{installing ? t("extension_installing") : extension.action}</span>
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
              <h2 id="diagnostics-heading">{t("diagnostics_title")}</h2>
              <p>{t("diagnostics_desc")}</p>
            </div>
          </div>
          <div className="settings-card__body settings-card__body--actions">
            <ul className="plain-check-list">
              <li><Icon name="check" size={15} /> {t("diagnostics_item1")}</li>
              <li><Icon name="check" size={15} /> {t("diagnostics_item2")}</li>
              <li><Icon name="shield" size={15} /> {t("diagnostics_item3")}</li>
            </ul>
            <button
              className="button button--secondary button--full"
              disabled={copying}
              onClick={onCopyDiagnostics}
              type="button"
            >
              <Icon name={copying ? "loader" : "copy"} size={16} />
              <span>{copying ? t("diagnostics_copying") : t("diagnostics_copy")}</span>
            </button>
          </div>
        </section>

        <section className="settings-card" aria-labelledby="language-heading">
          <div className="settings-card__header settings-card__header--stackable">
            <div className="settings-card__icon settings-card__icon--blue">
              <Icon name="settings" />
            </div>
            <div>
              <h2 id="language-heading">{t("language_label")}</h2>
              <p>Wybierz język interfejsu. / Choose the UI language.</p>
            </div>
          </div>
          <div className="settings-card__body">
            <select
              value={getLanguage()}
              onChange={(e) => onLanguageChange(e.target.value as Language)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "6px",
                backgroundColor: "var(--background-secondary, #161920)",
                border: "1px solid var(--border-color, #2d3139)",
                color: "var(--text-primary, #fff)",
                fontFamily: "inherit",
                fontSize: "14px",
                outline: "none",
                cursor: "pointer"
              }}
            >
              <option value="pl">Polski</option>
              <option value="en">English</option>
            </select>
          </div>
        </section>

        <section className="settings-card settings-card--privacy" aria-labelledby="privacy-heading">
          <div className="settings-card__header settings-card__header--stackable">
            <div className="settings-card__icon settings-card__icon--green">
              <Icon name="shield" />
            </div>
            <div>
              <h2 id="privacy-heading">{t("privacy_title")}</h2>
              <p>{t("privacy_desc")}</p>
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
            {t("privacy_note")}
          </p>
        </section>
      </div>
    </div>
  );
}
