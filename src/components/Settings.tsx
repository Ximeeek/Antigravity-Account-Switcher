import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AppSettings, AppState } from "../types";
import { Icon } from "./Icons";
import { StatusPill, type StatusTone } from "./StatusPill";
import { t, getLanguage, type Language } from "../i18n";
import { Modal } from "./Modal";

interface SettingsProps {
  state: AppState;
  workingAction?: string | null;
  onSave: (settings: AppSettings) => Promise<void>;
  onCopyDiagnostics: () => Promise<void>;
  onLanguageChange: (lang: Language) => void;
  onWipeData: () => Promise<void>;
  onUninstallApp: () => Promise<void>;
}

export function Settings({
  state,
  workingAction,
  onSave,
  onCopyDiagnostics,
  onLanguageChange,
  onWipeData,
  onUninstallApp,
}: SettingsProps) {
  const [draft, setDraft] = useState<AppSettings>(state.settings);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [showUninstallModal, setShowUninstallModal] = useState(false);

  useEffect(() => setDraft(state.settings), [state.settings]);

  const dirty = useMemo(
    () =>
      draft.http_port !== state.settings.http_port ||
      draft.antigravity_path.trim() !== state.settings.antigravity_path.trim() ||
      draft.smart_switch_enabled !== state.settings.smart_switch_enabled,
    [draft, state.settings],
  );

  const saving = workingAction === "settings";
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

            <div className="field-row field-row--checkbox" style={{ marginTop: "20px", marginBottom: "12px" }}>
              <label className="checkbox-field" style={{ display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={draft.smart_switch_enabled}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      smart_switch_enabled: event.target.checked,
                    }))
                  }
                  style={{ 
                    marginTop: "3px",
                    width: "16px",
                    height: "16px",
                    accentColor: "var(--accent-color, #5865f2)",
                    cursor: "pointer"
                  }}
                />
                <div>
                  <span className="field__label" style={{ fontWeight: 600, display: "block", fontSize: "14px", color: "var(--text-primary, #fff)" }}>
                    {t("smart_switch_label")}
                  </span>
                  <p className="field-hint" style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary, #8e9297)", lineHeight: "1.4" }}>
                    {t("smart_switch_hint")}
                  </p>
                </div>
              </label>
            </div>

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

        <section className="settings-card settings-card--maintenance" aria-labelledby="maintenance-heading">
          <div className="settings-card__header settings-card__header--stackable">
            <div className="settings-card__icon settings-card__icon--red" style={{ backgroundColor: "rgba(239, 68, 68, 0.1)", color: "#ef4444" }}>
              <Icon name="trash" />
            </div>
            <div>
              <h2 id="maintenance-heading">{t("maintenance_title")}</h2>
              <p>{t("maintenance_desc")}</p>
            </div>
          </div>
          <div className="settings-card__body settings-card__body--actions" style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
            <div style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color, #2d3139)", backgroundColor: "var(--background-secondary, #161920)" }}>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 600, color: "var(--text-primary, #fff)" }}>
                {t("maintenance_wipe_title")}
              </h3>
              <p style={{ margin: "0 0 12px 0", fontSize: "12px", lineHeight: "1.4", color: "var(--text-secondary, #8e9297)" }}>
                {t("maintenance_wipe_desc")}
              </p>
              <button
                className="button button--secondary"
                style={{ borderColor: "#ef4444", color: "#ef4444", width: "auto" }}
                onClick={() => setShowWipeModal(true)}
                type="button"
                disabled={!!workingAction}
              >
                <Icon name="refresh" size={16} />
                <span>{t("maintenance_wipe_btn")}</span>
              </button>
            </div>

            <div style={{ padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color, #2d3139)", backgroundColor: "var(--background-secondary, #161920)" }}>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: 600, color: "var(--text-primary, #fff)" }}>
                {t("maintenance_uninstall_title")}
              </h3>
              <p style={{ margin: "0 0 12px 0", fontSize: "12px", lineHeight: "1.4", color: "var(--text-secondary, #8e9297)" }}>
                {t("maintenance_uninstall_desc")}
              </p>
              <button
                className="button button--secondary"
                style={{ borderColor: "#ef4444", color: "#ef4444", width: "auto" }}
                onClick={() => setShowUninstallModal(true)}
                type="button"
                disabled={!!workingAction}
              >
                <Icon name="trash" size={16} />
                <span>{t("maintenance_uninstall_btn")}</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Wipe Confirmation Modal */}
      <Modal
        open={showWipeModal}
        onClose={() => setShowWipeModal(false)}
        title={t("maintenance_confirm_wipe_title")}
        description={t("maintenance_confirm_wipe_desc")}
        icon={<Icon name="refresh" style={{ color: "#ef4444" }} />}
        footer={
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", width: "100%" }}>
            <button
              className="button button--secondary"
              onClick={() => setShowWipeModal(false)}
              type="button"
            >
              {t("add_modal_cancel")}
            </button>
            <button
              className="button button--primary"
              style={{ backgroundColor: "#ef4444" }}
              onClick={async () => {
                setShowWipeModal(false);
                await onWipeData();
              }}
              type="button"
            >
              {t("maintenance_wipe_btn")}
            </button>
          </div>
        }
      >
        <div style={{ color: "var(--text-secondary, #8e9297)", fontSize: "14px", lineHeight: "1.5" }}>
          {t("delete_modal_warning")}
        </div>
      </Modal>

      {/* Uninstall Confirmation Modal */}
      <Modal
        open={showUninstallModal}
        onClose={() => setShowUninstallModal(false)}
        title={t("maintenance_confirm_uninstall_title")}
        description={t("maintenance_confirm_uninstall_desc")}
        icon={<Icon name="trash" style={{ color: "#ef4444" }} />}
        footer={
          <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", width: "100%" }}>
            <button
              className="button button--secondary"
              onClick={() => setShowUninstallModal(false)}
              type="button"
            >
              {t("add_modal_cancel")}
            </button>
            <button
              className="button button--primary"
              style={{ backgroundColor: "#ef4444" }}
              onClick={async () => {
                setShowUninstallModal(false);
                await onUninstallApp();
              }}
              type="button"
            >
              {t("maintenance_uninstall_btn")}
            </button>
          </div>
        }
      >
        <div style={{ color: "var(--text-secondary, #8e9297)", fontSize: "14px", lineHeight: "1.5" }}>
          {t("delete_modal_warning")}
        </div>
      </Modal>
    </div>
  );
}
