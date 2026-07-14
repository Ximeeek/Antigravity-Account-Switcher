import { useEffect, useId, useState, type FormEvent } from "react";
import type { AddProfileInput, ProfileSummary } from "../types";
import { Icon } from "./Icons";
import { Modal } from "./Modal";
import { getDisclaimerText } from "../utils";
import { t } from "../i18n";


interface AddProfileModalProps {
  open: boolean;
  working?: boolean;
  onClose: () => void;
  onSubmit: (displayName: string, autoActivate: boolean) => Promise<void>;
  isFirstProfile: boolean;
}

export function AddProfileModal({
  open,
  working = false,
  onClose,
  onSubmit,
  isFirstProfile,
}: AddProfileModalProps) {
  const rawFormId = useId();
  const formId = `add-profile-${rawFormId.replaceAll(":", "")}`;
  const [displayName, setDisplayName] = useState("");
  const [autoActivate, setAutoActivate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const disclaimer = getDisclaimerText();

  useEffect(() => {
    if (!open) return;
    setDisplayName("");
    setAutoActivate(true);
    setError(null);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setError(t("add_modal_validation_len"));
      return;
    }
    setError(null);
    await onSubmit(name, autoActivate);
  };

  return (
    <Modal
      dismissible={true} // Allow closing the modal to trigger cancel_oauth_login
      eyebrow={t("add_modal_eyebrow")}
      footer={
        <>
          <button
            className="button button--ghost"
            data-autofocus
            onClick={onClose}
            type="button"
          >
            {t("add_modal_cancel")}
          </button>
          <button
            className="button button--primary"
            disabled={working}
            form={formId}
            type="submit"
          >
            <Icon name={working ? "loader" : "plus"} size={16} />
            <span>{working ? t("add_modal_submitting") : t("add_modal_submit")}</span>
          </button>
        </>
      }
      icon={<Icon name="user" size={21} />}
      onClose={onClose}
      open={open}
      title={t("add_modal_title")}
      description={t("add_modal_desc")}
    >
      <form className="modal-form" id={formId} onSubmit={submit}>
        {working ? (
          <div className="compact-alert compact-alert--info">
            <Icon name="loader" size={17} className="animate-spin" />
            <span>
              <strong>{t("add_modal_waiting")}</strong><br />
              {t("add_modal_waiting_desc")}
            </span>
          </div>
        ) : (
          <div className="compact-alert compact-alert--info">
            <Icon name="info" size={17} />
            <span>
              {t("add_modal_redirect")}
            </span>
          </div>
        )}

        <div className="compact-alert compact-alert--warning" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <Icon name="shield" size={17} />
            <strong>{disclaimer.title}</strong>
          </div>
          <span style={{ fontSize: "0.85em", lineHeight: "1.4" }}>
            {disclaimer.body}
          </span>
          <div style={{ fontSize: "0.8em", marginTop: "4px" }}>
            <strong>{disclaimer.linksLabel}</strong>{" "}
            <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit", marginRight: "8px" }}>{disclaimer.tosLink}</a>
            <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit", marginRight: "8px" }}>{disclaimer.geminiLink}</a>
            <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit" }}>{disclaimer.fairUseLink}</a>
          </div>
        </div>

        <label className="field" htmlFor={`${formId}-name`}>
          <span className="field__label">{t("add_modal_name_label")}</span>
          <input
            autoComplete="off"
            disabled={working}
            id={`${formId}-name`}
            maxLength={48}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder={t("add_modal_name_placeholder")}
            required
            type="text"
            value={displayName}
          />
          <span className="field-hint">{t("add_modal_name_hint")}</span>
        </label>

        {isFirstProfile && (
          <label className="field-checkbox" style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "16px", marginBottom: "16px", cursor: "pointer", userSelect: "none" }}>
            <input
              type="checkbox"
              disabled={working}
              checked={autoActivate}
              onChange={(event) => setAutoActivate(event.target.checked)}
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
            <span style={{ fontSize: "0.9em", color: "var(--text-color, #e1e4e8)" }}>
              {t("add_modal_auto_activate")}
            </span>
          </label>
        )}

        {error ? (
          <p className="field-error" role="alert">
            <Icon name="error" size={16} />
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

interface DeleteProfileModalProps {
  profile: ProfileSummary | null;
  working?: boolean;
  onClose: () => void;
  onConfirm: (profile: ProfileSummary) => Promise<void>;
}

export function DeleteProfileModal({
  profile,
  working = false,
  onClose,
  onConfirm,
}: DeleteProfileModalProps) {
  return (
    <Modal
      className="modal-panel--compact"
      dismissible={!working}
      footer={
        <>
          <button
            className="button button--ghost"
            data-autofocus
            disabled={working}
            onClick={onClose}
            type="button"
          >
            {t("delete_modal_cancel")}
          </button>
          <button
            className="button button--danger"
            disabled={working || !profile}
            onClick={() => profile && onConfirm(profile)}
            type="button"
          >
            <Icon name={working ? "loader" : "trash"} size={16} />
            <span>{working ? t("delete_modal_confirming") : t("delete_modal_confirm")}</span>
          </button>
        </>
      }
      icon={<Icon name="trash" size={21} />}
      onClose={onClose}
      open={Boolean(profile)}
      title={t("delete_modal_title")}
      description={
        profile
          ? t("delete_modal_desc", { name: profile.display_name })
          : undefined
      }
    >
      <div className="compact-alert compact-alert--danger">
        <Icon name="alert" size={17} />
        <span>{t("delete_modal_warning")}</span>
      </div>
    </Modal>
  );
}

interface GeekSpecsModalProps {
  open: boolean;
  state: any;
  onClose: () => void;
}

export function GeekSpecsModal({ open, state, onClose }: GeekSpecsModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopySpecs = () => {
    const specsText = JSON.stringify({
      tauriVersion: "v2.0",
      rustEdition: "2024",
      httpPort: state?.settings?.http_port,
      antigravityPath: state?.settings?.antigravity_path || "Unknown",
      sqliteDbPath: "%APPDATA%\\Antigravity\\User\\globalStorage\\state.vscdb",
      dataDir: "%LOCALAPPDATA%\\AntigravitySwitcher",
      logsFile: "%LOCALAPPDATA%\\AntigravitySwitcher\\logs\\switcher.log",
      userAgent: navigator.userAgent
    }, null, 2);
    
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(specsText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Modal
      dismissible={true}
      eyebrow={t("dev_specs_title")}
      footer={
        <>
          <button
            className="button button--ghost"
            onClick={handleCopySpecs}
            type="button"
          >
            <Icon name={copied ? "check" : "copy"} size={16} />
            <span>{copied ? t("dev_specs_copied") : t("dev_copy_specs")}</span>
          </button>
          <button
            className="button button--primary"
            data-autofocus
            onClick={onClose}
            type="button"
          >
            <span>{t("close_message")}</span>
          </button>
        </>
      }
      icon={<Icon name="settings" size={21} />}
      onClose={onClose}
      open={open}
      title={t("dev_specs_title")}
      description={t("dev_specs_desc")}
    >
      <div className="geek-specs-grid" style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "12px",
        fontSize: "0.85rem",
        color: "var(--text-secondary)",
        maxHeight: "360px",
        overflowY: "auto",
        paddingRight: "4px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
          <strong>{t("dev_tauri_version")}:</strong>
          <span>v2.0 (Tauri SDK)</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
          <strong>{t("dev_rust_edition")}:</strong>
          <span>2024</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
          <strong>{t("dev_http_port")}:</strong>
          <span>{state?.settings?.http_port ?? "48731"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--border)", paddingBottom: "8px", gap: "4px" }}>
          <strong>{t("dev_antigravity_path")}:</strong>
          <code style={{ background: "var(--surface-inset)", padding: "4px 8px", borderRadius: "6px", wordBreak: "break-all" }}>
            {state?.settings?.antigravity_path || "Nie wykryto / Not detected"}
          </code>
        </div>
        <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--border)", paddingBottom: "8px", gap: "4px" }}>
          <strong>{t("dev_sqlite_db")}:</strong>
          <code style={{ background: "var(--surface-inset)", padding: "4px 8px", borderRadius: "6px", wordBreak: "break-all" }}>
            %APPDATA%\Antigravity\User\globalStorage\state.vscdb
          </code>
        </div>
        <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--border)", paddingBottom: "8px", gap: "4px" }}>
          <strong>{t("dev_data_dir")}:</strong>
          <code style={{ background: "var(--surface-inset)", padding: "4px 8px", borderRadius: "6px", wordBreak: "break-all" }}>
            %LOCALAPPDATA%\AntigravitySwitcher
          </code>
        </div>
        <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--border)", paddingBottom: "8px", gap: "4px" }}>
          <strong>{t("dev_logs_file")}:</strong>
          <code style={{ background: "var(--surface-inset)", padding: "4px 8px", borderRadius: "6px", wordBreak: "break-all" }}>
            %LOCALAPPDATA%\AntigravitySwitcher\logs\switcher.log
          </code>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
          <strong>{t("dev_os_arch")}:</strong>
          <span>Windows (x64 / amd64)</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <strong>{t("dev_tech_stack")}:</strong>
          <span>React 18, TS, Rust, rusqlite</span>
        </div>
      </div>
    </Modal>
  );
}

