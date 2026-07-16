import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import type { AppSettings, AppState, ProfileSummary } from "../types";

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
  onLockProfile?: (profile: ProfileSummary) => void;
  onUnlockProfile?: (profile: ProfileSummary) => void;
  onRemoveProfileLock?: (profile: ProfileSummary) => void;
}

export function Settings({
  state,
  workingAction,
  onSave,
  onCopyDiagnostics,
  onLanguageChange,
  onWipeData,
  onUninstallApp,
  onLockProfile,
  onUnlockProfile,
  onRemoveProfileLock,
}: SettingsProps) {

  const [draft, setDraft] = useState<AppSettings>(state.settings);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [showUninstallModal, setShowUninstallModal] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackDesc, setFeedbackDesc] = useState("");
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  useEffect(() => setDraft(state.settings), [state.settings]);

  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    // Find all settings cards
    const cards = grid.querySelectorAll(".settings-card");
    const glowContainers: {
      card: HTMLElement;
      glows: HTMLElement[];
      left: number;
      top: number;
    }[] = [];

    // Initialize glow containers for each card
    cards.forEach((cardNode) => {
      const card = cardNode as HTMLElement;

      // Ensure the card has relative positioning
      if (getComputedStyle(card).position === "static") {
        card.style.position = "relative";
      }

      // Check if it already has the container
      let container = card.querySelector(".settings-card__glow-container") as HTMLElement;
      if (!container) {
        container = document.createElement("div");
        container.className = "settings-card__glow-container";
        container.setAttribute("aria-hidden", "true");

        // Create 3 glows
        for (let i = 1; i <= 3; i++) {
          const glow = document.createElement("div");
          glow.className = `settings-card__glow settings-card__glow--${i}`;
          container.appendChild(glow);
        }

        // Insert as first child so it sits behind card content
        card.insertBefore(container, card.firstChild);
      }

      const glows = Array.from(container.querySelectorAll(".settings-card__glow")) as HTMLElement[];
      glowContainers.push({
        card,
        glows,
        left: 0,
        top: 0,
      });
    });

    let gridWidth = 0;
    let gridHeight = 0;

    const updateOffsets = () => {
      const gridRect = grid.getBoundingClientRect();
      gridWidth = gridRect.width;
      gridHeight = gridRect.height;
      if (gridWidth === 0 || gridHeight === 0) return;

      glowContainers.forEach((item) => {
        const cardRect = item.card.getBoundingClientRect();
        item.left = cardRect.left - gridRect.left;
        item.top = cardRect.top - gridRect.top;
      });
    };

    // Run initially
    updateOffsets();

    // Listen to resize to update cached dimensions
    window.addEventListener("resize", updateOffsets);

    let animationFrameId: number;
    let lastTime = 0;
    let isAnimating = false;
    let lastInteractionTime = Date.now();

    let lastMouseX = -9999;
    let lastMouseY = -9999;

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX === lastMouseX && e.clientY === lastMouseY) {
        return;
      }
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      lastInteractionTime = Date.now();
      startAnimation();
    };

    grid.addEventListener("mousemove", handleMouseMove);

    const tick = (timestamp: number) => {
      if (!isAnimating) return;

      // Sleep loop after 10s of inactivity to achieve 0% idle CPU
      if (Date.now() - lastInteractionTime > 10000) {
        stopAnimation();
        return;
      }

      if (!lastTime) lastTime = timestamp;
      const t = timestamp / 1000; // time in seconds

      if (gridWidth === 0 || gridHeight === 0) {
        updateOffsets();
        if (gridWidth === 0 || gridHeight === 0) {
          animationFrameId = requestAnimationFrame(tick);
          return;
        }
      }

      // Calculate global coordinates of the 3 glows in the grid
      const w = gridWidth;
      const h = gridHeight;

      // Glow 1: organic curved path
      const g1x = w * (0.5 + 0.44 * Math.sin(t * 0.45));
      const g1y = h * (0.5 + 0.44 * Math.cos(t * 0.32 + 0.8));

      // Glow 2: figure-8 style drifting path
      const g2x = w * (0.5 + 0.42 * Math.sin(t * 0.38 + 2.0));
      const g2y = h * (0.5 + 0.42 * Math.sin(t * 0.76) * Math.cos(t * 0.18 + 0.5));

      // Glow 3: wide loop with speed variations
      const angle3 = t * 0.28 + Math.sin(t * 0.12) * 0.4;
      const g3x = w * (0.5 + 0.4 * Math.cos(angle3));
      const g3y = h * (0.5 + 0.4 * Math.sin(angle3 * 1.4 + 1.2));

      const glowPositions = [
        { x: g1x, y: g1y },
        { x: g2x, y: g2y },
        { x: g3x, y: g3y },
      ];

      // Update local position of each glow inside each card
      glowContainers.forEach((item) => {
        glowPositions.forEach((pos, idx) => {
          const glowEl = item.glows[idx];
          if (glowEl) {
            const localX = pos.x - item.left;
            const localY = pos.y - item.top;
            glowEl.style.transform = `translate3d(${localX.toFixed(1)}px, ${localY.toFixed(1)}px, 0)`;
          }
        });
      });

      animationFrameId = requestAnimationFrame(tick);
    };

    const startAnimation = () => {
      if (!isAnimating && !prefersReducedMotion && document.hasFocus() && document.visibilityState === "visible") {
        isAnimating = true;
        lastTime = 0;
        animationFrameId = requestAnimationFrame(tick);
      }
    };

    const stopAnimation = () => {
      if (isAnimating) {
        isAnimating = false;
        cancelAnimationFrame(animationFrameId);
      }
    };

    const handleFocus = () => {
      updateOffsets();
      lastInteractionTime = Date.now();
      startAnimation();
    };

    const handleBlur = () => {
      stopAnimation();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateOffsets();
        lastInteractionTime = Date.now();
        startAnimation();
      } else {
        stopAnimation();
      }
    };

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = mediaQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        stopAnimation();
      } else {
        startAnimation();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    mediaQuery.addEventListener("change", handleMotionChange);

    if (!prefersReducedMotion) {
      startAnimation();
    }

    return () => {
      grid.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", updateOffsets);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      mediaQuery.removeEventListener("change", handleMotionChange);
      stopAnimation();
    };
  }, []);

  const dirty = useMemo(
    () =>
      draft.http_port !== state.settings.http_port ||
      draft.antigravity_path.trim() !== state.settings.antigravity_path.trim() ||
      draft.smart_switch_enabled !== state.settings.smart_switch_enabled ||
      draft.minimize_to_tray !== state.settings.minimize_to_tray,
    [draft, state.settings],
  );

  const saving = workingAction === "settings";
  const copying = workingAction === "diagnostics";

  const handleSendGitHub = async () => {
    if (!feedbackTitle.trim() || !feedbackDesc.trim()) {
      setFeedbackError(t("feedback_validation_empty"));
      return;
    }
    setFeedbackError(null);
    const customRepo = localStorage.getItem("devtools_github_repo") || "Ximeeek/Antigravity-Account-Switcher";
    const repoUrl = `https://github.com/h/${customRepo}/issues/new`.replace("/h/", "/");
    const title = encodeURIComponent(feedbackTitle);
    const body = encodeURIComponent(`## Description\n${feedbackDesc}\n\n---\n*Sent from Antigravity Account Switcher Client*`);
    const url = `${repoUrl}?title=${title}&body=${body}`;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_browser_url", { url });
    } catch (err) {
      console.error("Failed to open browser:", err);
      window.open(url, "_blank");
    }
  };

  const handleSendEmail = async () => {
    if (!feedbackTitle.trim() || !feedbackDesc.trim()) {
      setFeedbackError(t("feedback_validation_empty"));
      return;
    }
    setFeedbackError(null);
    setEmailStatus("sending");
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const customFormId = localStorage.getItem("devtools_form_id") || null;
      const customSubjectId = localStorage.getItem("devtools_subject_id") || null;
      const customDescId = localStorage.getItem("devtools_desc_id") || null;

      await invoke("send_email_report", {
        subject: feedbackTitle,
        message: feedbackDesc,
        customFormId,
        customSubjectId,
        customDescId
      });
      setEmailStatus("success");
      setFeedbackTitle("");
      setFeedbackDesc("");
      setTimeout(() => setEmailStatus("idle"), 4000);
    } catch (err: any) {
      console.error(err);
      setEmailStatus("error");
      setFeedbackError(err.message || String(err));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.http_port < 1024 || draft.http_port > 65535) {
      setValidationError(t("validation_port"));
      return;
    }
    if (!draft.antigravity_path.trim()) {
      setValidationError(t("validation_path"));
      return;
    }
    if (draft.smart_switch_enabled && state.profiles.length <= 1) {
      setValidationError(t("validation_smart_switch_profiles"));
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

      <div className="settings-grid" ref={gridRef}>
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

            <div className="field-row field-row--toggle" style={{ marginTop: "20px", marginBottom: "16px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <button
                  type="button"
                  className={`smart-switch-toggle ${draft.smart_switch_enabled ? "smart-switch-toggle--active" : ""}`}
                  onClick={() => {
                    const nextVal = !draft.smart_switch_enabled;
                    if (nextVal && state.profiles.length <= 1) {
                      setValidationError(t("validation_smart_switch_profiles"));
                      return;
                    }
                    setValidationError(null);
                    setDraft((current) => ({
                      ...current,
                      smart_switch_enabled: nextVal,
                    }));
                  }}
                  style={{ marginTop: "4px", flexShrink: 0 }}
                  aria-label={t("smart_switch_label")}
                >
                  <div className="smart-switch-toggle__thumb" />
                </button>
                <div>
                  <span
                    className="field__label"
                    onClick={() => {
                      const nextVal = !draft.smart_switch_enabled;
                      if (nextVal && state.profiles.length <= 1) {
                        setValidationError(t("validation_smart_switch_profiles"));
                        return;
                      }
                      setValidationError(null);
                      setDraft((current) => ({
                        ...current,
                        smart_switch_enabled: nextVal,
                      }));
                    }}
                    style={{ fontWeight: 600, display: "block", fontSize: "14px", color: "var(--text-primary, #fff)", cursor: "pointer" }}
                  >
                    {t("smart_switch_label")}
                  </span>
                  <p className="field-hint" style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary, #8e9297)", lineHeight: "1.4" }}>
                    {t("smart_switch_hint")}
                  </p>
                </div>
              </div>
            </div>

            <div className="field-row field-row--toggle" style={{ marginTop: "16px", marginBottom: "12px" }}>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <button
                  type="button"
                  className={`smart-switch-toggle ${draft.minimize_to_tray ? "smart-switch-toggle--active" : ""}`}
                  onClick={() => {
                    setDraft((current) => ({
                      ...current,
                      minimize_to_tray: !current.minimize_to_tray,
                    }));
                  }}
                  style={{ marginTop: "4px", flexShrink: 0 }}
                  aria-label={t("minimize_to_tray_label")}
                >
                  <div className="smart-switch-toggle__thumb" />
                </button>
                <div>
                  <span
                    className="field__label"
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        minimize_to_tray: !current.minimize_to_tray,
                      }));
                    }}
                    style={{ fontWeight: 600, display: "block", fontSize: "14px", color: "var(--text-primary, #fff)", cursor: "pointer" }}
                  >
                    {t("minimize_to_tray_label")}
                  </span>
                  <p className="field-hint" style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--text-secondary, #8e9297)", lineHeight: "1.4" }}>
                    {t("minimize_to_tray_hint")}
                  </p>
                </div>
              </div>
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
              <p>{t("language_desc")}</p>
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

        <section className="settings-card" aria-labelledby="security-heading">
          <div className="settings-card__header settings-card__header--stackable">
            <div className="settings-card__icon" style={{ backgroundColor: "rgba(240, 178, 50, 0.1)", color: "#f0b232", borderColor: "rgba(240, 178, 50, 0.18)" }}>
              <Icon name="lock" />
            </div>
            <div>
              <h2 id="security-heading">{t("settings_security_title")}</h2>
              <p>{t("settings_security_desc")}</p>
            </div>
          </div>
          <div className="settings-card__body" style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
            <div 
              style={{ 
                display: "flex", 
                alignItems: "center", 
                justifyContent: "space-between", 
                padding: "12px", 
                borderRadius: "8px", 
                border: "1px solid var(--border-color, #2d3139)", 
                backgroundColor: "var(--background-secondary, #161920)",
                fontSize: "14px"
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ color: "var(--text-primary, #fff)" }}>
                  {state.hasMasterPassword ? t("settings_security_status_on") : t("settings_security_status_off")}
                </strong>
                <span style={{ fontSize: "11px", color: "var(--text-secondary, #8e9297)" }}>
                  {state.hasMasterPassword 
                    ? t("settings_security_hint_on") 
                    : t("settings_security_hint_off")}
                </span>
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                {state.hasMasterPassword ? (
                  <>
                    <button
                      className="button button--secondary button--small"
                      onClick={() => onRemoveProfileLock?.({} as any)}
                      type="button"
                      style={{ padding: "4px 8px", fontSize: "12px" }}
                    >
                      <Icon name="unlock" size={14} style={{ marginRight: "4px" }} />
                      <span>{t("settings_security_btn_disable")}</span>
                    </button>
                    <button
                      className="button button--secondary button--small"
                      onClick={async () => {
                        try {
                          const { invoke } = await import("@tauri-apps/api/core");
                          await invoke("close_app_lock");
                          window.location.reload();
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                      type="button"
                      style={{ padding: "4px 8px", fontSize: "12px" }}
                    >
                      <Icon name="lock" size={14} style={{ marginRight: "4px" }} />
                      <span>{t("settings_security_btn_lock_now")}</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="button button--primary button--small"
                    onClick={() => onLockProfile?.({} as any)}
                    type="button"
                    style={{ padding: "4px 8px", fontSize: "12px" }}
                  >
                    <Icon name="lock" size={14} style={{ marginRight: "4px" }} />
                    <span>{t("settings_security_btn_enable")}</span>
                  </button>
                )}
              </div>
            </div>
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

        <section className="settings-card settings-card--feedback" aria-labelledby="feedback-heading">
          <div className="settings-card__header settings-card__header--stackable">
            <div className="settings-card__icon settings-card__icon--blue" style={{ backgroundColor: "rgba(74, 140, 247, 0.1)", color: "#4a8cf7" }}>
              <Icon name="mail" />
            </div>
            <div>
              <h2 id="feedback-heading">{t("settings_feedback_title")}</h2>
              <p>{t("settings_feedback_desc")}</p>
              <p style={{ margin: "2px 0 0 0", fontSize: "10px", color: "var(--accent-blue, #4a8cf7)" }}>{t("feedback_desc_note")}</p>
            </div>
          </div>
          <div className="settings-card__body" style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label className="field" htmlFor="bug-title" style={{ width: "100%" }}>
                <span className="field__label" style={{ marginBottom: "4px", display: "inline-block" }}>{t("feedback_title_label")}</span>
                <input
                  id="bug-title"
                  type="text"
                  placeholder={t("feedback_title_placeholder")}
                  value={feedbackTitle}
                  onChange={(e) => setFeedbackTitle(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    backgroundColor: "var(--background-secondary, #161920)",
                    border: "1px solid var(--border-color, #2d3139)",
                    color: "var(--text-primary, #fff)",
                    fontFamily: "inherit",
                    fontSize: "13px"
                  }}
                />
              </label>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label className="field" htmlFor="bug-desc" style={{ width: "100%" }}>
                <span className="field__label" style={{ marginBottom: "4px", display: "inline-block" }}>{t("feedback_desc_label")}</span>
                <textarea
                  id="bug-desc"
                  placeholder={t("feedback_desc_placeholder")}
                  value={feedbackDesc}
                  onChange={(e) => setFeedbackDesc(e.target.value)}
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    backgroundColor: "var(--background-secondary, #161920)",
                    border: "1px solid var(--border-color, #2d3139)",
                    color: "var(--text-primary, #fff)",
                    fontFamily: "inherit",
                    fontSize: "13px",
                    resize: "vertical"
                  }}
                />
              </label>
            </div>

            {feedbackError ? (
              <p className="field-error" style={{ color: "#ef4444", fontSize: "12px", margin: "4px 0", display: "flex", alignItems: "center", gap: "6px" }} role="alert">
                <Icon name="error" size={14} />
                <span>{feedbackError}</span>
              </p>
            ) : null}

            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                onClick={handleSendGitHub}
                className="button button--primary"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  padding: "8px 12px",
                  height: "36px",
                  cursor: "pointer",
                  boxSizing: "border-box"
                }}
              >
                <span>{t("feedback_btn_github")}</span>
              </button>
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={emailStatus === "sending"}
                className={`button ${emailStatus === "success" ? "button--success" : "button--secondary"}`}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "12px",
                  padding: "8px 12px",
                  height: "36px",
                  cursor: emailStatus === "sending" ? "default" : "pointer",
                  boxSizing: "border-box",
                  backgroundColor: emailStatus === "success" ? "#23a55a" : undefined,
                  borderColor: emailStatus === "success" ? "#23a55a" : undefined,
                  color: emailStatus === "success" ? "#fff" : undefined
                }}
              >
                <span>
                  {emailStatus === "sending"
                    ? t("feedback_status_sending")
                    : emailStatus === "success"
                    ? t("feedback_status_success")
                    : emailStatus === "error"
                    ? t("feedback_status_error")
                    : t("feedback_btn_email")}
                </span>
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
