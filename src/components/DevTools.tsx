import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Icon } from "./Icons";
import { t } from "../i18n";
import type { AppState } from "../types";

interface DevToolsProps {
  state: AppState;
  onSetNotice: (notice: { tone: "success" | "info" | "danger"; message: string } | null) => void;
}

export function DevTools({ onSetNotice }: DevToolsProps) {
  const [delay, setDelay] = useState<number>(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const [githubRepo, setGithubRepo] = useState("");
  const [formId, setFormId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [descId, setDescId] = useState("");

  useEffect(() => {
    setGithubRepo(localStorage.getItem("devtools_github_repo") || "");
    setFormId(localStorage.getItem("devtools_form_id") || "");
    setSubjectId(localStorage.getItem("devtools_subject_id") || "");
    setDescId(localStorage.getItem("devtools_desc_id") || "");
  }, []);

  const handleSaveFeedback = () => {
    localStorage.setItem("devtools_github_repo", githubRepo.trim());
    localStorage.setItem("devtools_form_id", formId.trim());
    localStorage.setItem("devtools_subject_id", subjectId.trim());
    localStorage.setItem("devtools_desc_id", descId.trim());
    onSetNotice({ tone: "success", message: t("devtools_feedback_saved") });
  };

  const handleResetFeedback = () => {
    localStorage.removeItem("devtools_github_repo");
    localStorage.removeItem("devtools_form_id");
    localStorage.removeItem("devtools_subject_id");
    localStorage.removeItem("devtools_desc_id");
    setGithubRepo("");
    setFormId("");
    setSubjectId("");
    setDescId("");
    onSetNotice({ tone: "success", message: t("devtools_feedback_reset") });
  };

  const inputStyle = {
    background: "var(--surface-inset, #1a1d24)",
    border: "1px solid var(--border, #2d3139)",
    borderRadius: "6px",
    padding: "8px 12px",
    color: "var(--text-primary, #ffffff)",
    width: "100%",
    fontFamily: "inherit",
    fontSize: "13px",
    marginTop: "4px"
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const handleCancel = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setIsTriggering(false);
    onSetNotice({ tone: "info", message: t("devtools_toast_cancelled") });
  };

  const handleTrigger = () => {
    if (isTriggering) return;

    if (delay <= 0) {
      void executeSwitch();
      return;
    }

    setIsTriggering(true);
    setCountdown(delay);
    onSetNotice({ tone: "success", message: t("devtools_toast_triggered", { delay: String(delay) }) });

    let currentCount = delay;
    countdownIntervalRef.current = window.setInterval(() => {
      currentCount -= 1;
      if (currentCount <= 0) {
        if (countdownIntervalRef.current) {
          window.clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        setCountdown(null);
      } else {
        setCountdown(currentCount);
      }
    }, 1000);

    timerRef.current = window.setTimeout(() => {
      void executeSwitch();
    }, delay * 1000);
  };

  const executeSwitch = async () => {
    setIsTriggering(false);
    setCountdown(null);
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    onSetNotice({ tone: "success", message: t("devtools_toast_running") });
    try {
      await invoke("force_smart_switch");
    } catch (err) {
      console.error("Forced smart switch failed:", err);
      onSetNotice({ tone: "danger", message: String(err) });
    }
  };

  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow" style={{ color: "#ff5c5c" }}>{t("devtools_tab_title")}</p>
          <h1 style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon name="zap" size={28} style={{ color: "#ff5c5c" }} />
            {t("devtools_header")}
          </h1>
          <p>{t("devtools_desc")}</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="settings-card settings-card--server" aria-labelledby="devtools-heading">
          <div className="settings-card__header">
            <div className="settings-card__icon" style={{ background: "rgba(255, 92, 92, 0.1)", color: "#ff5c5c" }}>
              <Icon name="refresh" />
            </div>
            <div>
              <h2 id="devtools-heading">{t("devtools_smart_switch_title")}</h2>
              <p>{t("devtools_smart_switch_desc")}</p>
            </div>
          </div>

          <div className="settings-form" style={{ marginTop: "20px" }}>
            <div className="field-row">
              <label className="field" htmlFor="switch-delay">
                <span className="field__label">{t("devtools_delay_label")}</span>
                <input
                  id="switch-delay"
                  type="number"
                  min={0}
                  max={60}
                  disabled={isTriggering}
                  value={delay}
                  onChange={(e) => setDelay(Math.max(0, parseInt(e.target.value) || 0))}
                  style={{
                    background: "var(--surface-inset, #1a1d24)",
                    border: "1px solid var(--border, #2d3139)",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    color: "var(--text-primary, #ffffff)",
                    width: "120px"
                  }}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "24px", alignItems: "center" }}>
              {isTriggering ? (
                <>
                  <button
                    className="button button--danger"
                    onClick={handleCancel}
                    type="button"
                  >
                    <Icon name="loader" size={16} className="animate-spin" />
                    <span>{t("devtools_btn_cancel")}</span>
                  </button>
                  <span style={{ fontSize: "0.9rem", fontWeight: "600", color: "#ff5c5c" }}>
                    {t("devtools_countdown", { count: String(countdown ?? delay) })}
                  </span>
                </>
              ) : (
                <button
                  className="button button--primary"
                  onClick={handleTrigger}
                  type="button"
                  style={{
                    background: "#ff5c5c",
                    borderColor: "#ff5c5c"
                  }}
                >
                  <Icon name="zap" size={16} />
                  <span>{t("devtools_btn_trigger")}</span>
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="settings-card settings-card--feedback-customizer">
          <div className="settings-card__header">
            <div className="settings-card__icon" style={{ background: "rgba(255, 92, 92, 0.1)", color: "#ff5c5c" }}>
              <Icon name="settings" />
            </div>
            <div>
              <h2 id="devtools-feedback-heading">{t("devtools_feedback_title")}</h2>
              <p>{t("devtools_feedback_desc")}</p>
            </div>
          </div>

          <div className="settings-form" style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <label className="field" style={{ width: "100%" }}>
              <span className="field__label">{t("devtools_github_label")}</span>
              <input
                type="text"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="Ximeeek/Antigravity-Account-Switcher"
                style={inputStyle}
              />
            </label>

            <label className="field" style={{ width: "100%" }}>
              <span className="field__label">{t("devtools_form_id_label")}</span>
              <input
                type="text"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
                placeholder="1FAIpQLSd3we3q3-D5yAPV6EoPOlW0wq3ELpkt4clDirPdUg4P4TNtgw"
                style={inputStyle}
              />
            </label>

            <div style={{ display: "flex", gap: "12px", width: "100%" }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">{t("devtools_subject_id_label")}</span>
                <input
                  type="text"
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                  placeholder="entry.1894779123"
                  style={inputStyle}
                />
              </label>

              <label className="field" style={{ flex: 1 }}>
                <span className="field__label">{t("devtools_desc_id_label")}</span>
                <input
                  type="text"
                  value={descId}
                  onChange={(e) => setDescId(e.target.value)}
                  placeholder="entry.1589479096"
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
              <button
                className="button button--primary"
                onClick={handleSaveFeedback}
                type="button"
                style={{ background: "#ff5c5c", borderColor: "#ff5c5c", cursor: "pointer" }}
              >
                <Icon name="check" size={16} />
                <span>{t("devtools_btn_save_feedback")}</span>
              </button>
              <button
                className="button button--secondary"
                onClick={handleResetFeedback}
                type="button"
                style={{ cursor: "pointer" }}
              >
                <Icon name="refresh" size={16} />
                <span>{t("devtools_btn_reset_feedback")}</span>
              </button>
            </div>

            <div style={{ marginTop: "16px", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color, #2d3139)", backgroundColor: "var(--background-secondary, #161920)" }}>
              <h3 style={{ margin: "0 0 6px 0", fontSize: "13px", fontWeight: 600, color: "var(--text-primary, #fff)", display: "flex", alignItems: "center", gap: "6px" }}>
                <Icon name="info" size={14} style={{ color: "var(--accent-blue, #4a8cf7)" }} />
                {t("devtools_feedback_guide_title")}
              </h3>
              <p style={{ margin: 0, fontSize: "11px", lineHeight: "1.5", color: "var(--text-secondary, #8e9297)", whiteSpace: "pre-line" }}>
                {t("devtools_feedback_guide_body")}
              </p>
            </div>
          </div>
        </section>

        <section className="settings-card" style={{ borderLeft: "4px solid #ff5c5c" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
            <Icon name="alert" size={20} style={{ color: "#ff5c5c", marginTop: "2px" }} />
            <div>
              <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: "1.5", color: "var(--text-secondary)" }}>
                {t("devtools_warning")}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
