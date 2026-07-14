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
