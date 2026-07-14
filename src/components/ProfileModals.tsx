import { useEffect, useId, useState, type FormEvent } from "react";
import type { AddProfileInput, ProfileSummary } from "../types";
import { AppMark, Icon } from "./Icons";
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

interface AboutModalProps {
  open: boolean;
  state: any;
  onClose: () => void;
}

export function AboutModal({ open, state, onClose }: AboutModalProps) {
  const [activeTab, setActiveTab] = useState<"about" | "specs">("about");
  const [copied, setCopied] = useState(false);
  const [releases, setReleases] = useState<any[]>([]);
  const [loadingReleases, setLoadingReleases] = useState(false);
  const [showStable, setShowStable] = useState(true);
  const [showPrerelease, setShowPrerelease] = useState(true);

  const mockReleases = [
    {
      html_url: "https://github.com/Ximeeek/Antigravity-Account-Switcher/releases/tag/v0.1.1-nightly.20260714",
      tag_name: "v0.1.1-nightly.20260714",
      published_at: "2026-07-14T11:30:00Z",
      prerelease: true,
    },
    {
      html_url: "https://github.com/Ximeeek/Antigravity-Account-Switcher/releases/tag/v0.1.0",
      tag_name: "v0.1.0",
      published_at: "2026-07-10T15:00:00Z",
      prerelease: false,
    },
    {
      html_url: "https://github.com/Ximeeek/Antigravity-Account-Switcher/releases/tag/v0.1.0-beta.2",
      tag_name: "v0.1.0-beta.2",
      published_at: "2026-07-08T09:15:00Z",
      prerelease: true,
    },
    {
      html_url: "https://github.com/Ximeeek/Antigravity-Account-Switcher/releases/tag/v0.1.0-beta.1",
      tag_name: "v0.1.0-beta.1",
      published_at: "2026-07-05T18:45:00Z",
      prerelease: true,
    },
    {
      html_url: "https://github.com/Ximeeek/Antigravity-Account-Switcher/releases/tag/v0.0.9",
      tag_name: "v0.0.9",
      published_at: "2026-06-20T12:00:00Z",
      prerelease: false,
    }
  ];

  useEffect(() => {
    if (!open) return;
    setActiveTab("about");
    setLoadingReleases(true);
    
    fetch("https://api.github.com/repos/Ximeeek/Antigravity-Account-Switcher/releases")
      .then((res) => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setReleases(data);
        } else {
          setReleases(mockReleases);
        }
      })
      .catch((err) => {
        console.warn("Failed to fetch releases, using fallback:", err);
        setReleases(mockReleases);
      })
      .finally(() => {
        setLoadingReleases(false);
      });
  }, [open]);

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

  const normalizeVer = (v: string) => v.toLowerCase().replace(/^v/, "").trim();
  const isCurrentVersion = (tag: string) => {
    const currentAppVer = state?.app_version || "0.1.1-nightly.20260714";
    return normalizeVer(tag) === normalizeVer(currentAppVer);
  };

  const filteredReleases = releases.filter((r) => {
    if (r.prerelease) return showPrerelease;
    return showStable;
  });

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <Modal
      dismissible={true}
      eyebrow={t("about_title")}
      footer={
        <>
          {activeTab === "specs" ? (
            <button
              className="button button--ghost"
              onClick={handleCopySpecs}
              type="button"
            >
              <Icon name={copied ? "check" : "copy"} size={16} />
              <span>{copied ? t("dev_specs_copied") : t("dev_copy_specs")}</span>
            </button>
          ) : (
            <a
              className="button button--ghost"
              href="https://github.com/Ximeeek/Antigravity-Account-Switcher/releases"
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <Icon name="info" size={16} />
              <span>{t("about_view_on_github")}</span>
            </a>
          )}
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
      icon={<Icon name="info" size={21} />}
      onClose={onClose}
      open={open}
      title={t("about_title")}
      description={t("about_desc")}
    >
      <div className="about-tabs">
        <button
          className={`about-tab-btn ${activeTab === "about" ? "about-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("about")}
          type="button"
        >
          {t("about_tab_info")}
        </button>
        <button
          className={`about-tab-btn ${activeTab === "specs" ? "about-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("specs")}
          type="button"
        >
          {t("about_tab_specs")}
        </button>
      </div>

      {activeTab === "about" ? (
        <div className="about-content-tab">
          <div className="about-brand-section">
            <div className="about-logo-wrapper">
              <AppMark size={48} />
            </div>
            <h3 className="about-app-name">Antigravity Account Switcher</h3>
            <p className="about-app-desc">{t("about_app_desc")}</p>
          </div>

          <div className="about-info-row">
            <span className="about-info-label">Account Switcher:</span>
            <span className="about-info-value" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <code>{state?.app_version || "—"}</code>
              <span className="about-badge about-badge--current">{t("about_badge_current")}</span>
            </span>
          </div>

          <div className="about-info-row">
            <span className="about-info-label">Antigravity Editor:</span>
            <span className="about-info-value">
              <code>{state?.antigravity_version || "—"}</code>
            </span>
          </div>

          <div className="about-releases-section">
            <div className="about-releases-header">
              <h4 className="about-releases-title">{t("about_version_list")}</h4>
              <div className="about-releases-filters">
                <label className="about-releases-filter-label">
                  <input
                    type="checkbox"
                    checked={showStable}
                    onChange={(e) => setShowStable(e.target.checked)}
                  />
                  <span>{t("about_show_stable")}</span>
                </label>
                <label className="about-releases-filter-label">
                  <input
                    type="checkbox"
                    checked={showPrerelease}
                    onChange={(e) => setShowPrerelease(e.target.checked)}
                  />
                  <span>{t("about_show_prerelease")}</span>
                </label>
              </div>
            </div>

            <div className="about-releases-list">
              {loadingReleases ? (
                <div className="about-releases-loading">
                  <Icon name="loader" size={16} className="animate-spin" />
                  <span>{t("about_loading_releases")}</span>
                </div>
              ) : filteredReleases.length === 0 ? (
                <div className="about-releases-empty">
                  {t("about_no_releases")}
                </div>
              ) : (
                filteredReleases.map((release) => {
                  const current = isCurrentVersion(release.tag_name);
                  return (
                    <a
                      key={release.tag_name}
                      className="about-release-item"
                      href={release.html_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="about-release-left">
                        <div className="about-release-tag-row">
                          <span className="about-release-tag">{release.tag_name}</span>
                          <div className="about-release-badges">
                            {current && (
                              <span className="about-badge about-badge--current">
                                {t("about_badge_current")}
                              </span>
                            )}
                            {release.prerelease ? (
                              <span className="about-badge about-badge--prerelease">
                                {t("about_badge_prerelease")}
                              </span>
                            ) : (
                              <span className="about-badge about-badge--stable">
                                {t("about_badge_stable")}
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="about-release-date">
                          {t("about_released_at", { date: formatDate(release.published_at) })}
                        </span>
                      </div>
                      <div className="about-release-right">
                        <Icon name="info" size={14} />
                      </div>
                    </a>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
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
      )}
    </Modal>
  );
}

