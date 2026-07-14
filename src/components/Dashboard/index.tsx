/**
 * Dashboard root view.
 * Integrates quota, active profile hero, saved profiles grid, and disclaimer footer.
 * Main exports: Dashboard
 */

import type { AppState, ProfileSummary } from "../../types";
import { getDisclaimerText } from "../../utils";
import { AccountCard } from "../AccountCard";
import { Icon } from "../Icons";
import { t } from "../../i18n";
import { showMiniWindow } from "../../bridge";

import ActiveAccount from "./ActiveAccount";
import EmptyState from "./EmptyState";
import GlobalQuotaSummary from "./GlobalQuotaSummary";

interface DashboardProps {
  state: AppState;
  busy?: boolean;
  onActivate: (profile: ProfileSummary) => void;
  onAdd: () => void;
  onDelete: (profile: ProfileSummary) => void;
  onToggleSmartSwitch: () => void;
  onSwitchLevelChange: (level: number) => void;
  onOpenGuide?: () => void;
  onLockProfile?: () => void;
}

export function Dashboard({
  state,
  busy = false,
  onActivate,
  onAdd,
  onDelete,
  onToggleSmartSwitch,
  onSwitchLevelChange,
  onOpenGuide,
  onLockProfile,
}: DashboardProps) {

  const disclaimer = getDisclaimerText();
  const isEmpty = state.profiles.length === 0;

  const active = state.profiles.find(
    (profile) => profile.profile_id === state.active_profile_id,
  );
  const otherProfiles = state.profiles.filter(
    (profile) => profile.profile_id !== state.active_profile_id,
  );

  const getProfilesCountLabel = (count: number): string => {
    if (count === 0) return t("section_desc_empty");
    if (count === 1) return t("section_desc_one");

    // In Polish, numbers ending in 2, 3, 4 (except 12, 13, 14) take "profile gotowe", others take "profili gotowych"
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) {
      return t("section_desc_many", { count: String(count) });
    }
    return t("section_desc_many_generic", { count: String(count) });
  };

  return (
    <div className="dashboard">
      {isEmpty ? (
        <EmptyState onAdd={onAdd} />
      ) : (
        <>
          <GlobalQuotaSummary profiles={state.profiles} />
          
          <div 
            className="security-status-widget"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 20px",
              borderRadius: "12px",
              background: state.hasMasterPassword 
                ? "linear-gradient(135deg, rgba(35, 165, 90, 0.05) 0%, rgba(12, 16, 26, 0.7) 100%)"
                : "linear-gradient(135deg, rgba(240, 178, 50, 0.05) 0%, rgba(16, 12, 22, 0.7) 100%)",
              border: state.hasMasterPassword
                ? "1px solid rgba(35, 165, 90, 0.2)"
                : "1px solid rgba(240, 178, 50, 0.2)",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
              marginBottom: "20px",
              backdropFilter: "blur(10px)",
              position: "relative",
              overflow: "hidden",
              animation: "slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
          >
            <div 
              style={{
                position: "absolute",
                top: "-50%",
                right: "-20%",
                width: "150px",
                height: "150px",
                borderRadius: "50%",
                background: state.hasMasterPassword 
                  ? "radial-gradient(circle, rgba(35, 165, 90, 0.1) 0%, transparent 70%)"
                  : "radial-gradient(circle, rgba(240, 178, 50, 0.1) 0%, transparent 70%)",
                pointerEvents: "none"
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div 
                className={state.hasMasterPassword ? "shield-glow-success" : "shield-glow-warning"}
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: state.hasMasterPassword ? "rgba(35, 165, 90, 0.12)" : "rgba(240, 178, 50, 0.12)",
                  color: state.hasMasterPassword ? "#23a55a" : "#f0b232",
                  transition: "all 0.3s ease"
                }}
              >
                <Icon name="shield" size={20} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {state.hasMasterPassword ? t("security_widget_secure") : t("security_widget_unsecured")}
                  </span>
                  {state.hasMasterPassword && (
                    <span style={{ 
                      fontSize: "9px", 
                      padding: "1px 5px", 
                      borderRadius: "6px", 
                      background: "rgba(35, 165, 90, 0.15)", 
                      color: "#23a55a", 
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px"
                    }}>
                      AES-256
                    </span>
                  )}
                </div>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  {state.hasMasterPassword 
                    ? t("security_widget_secure_desc")
                    : t("security_widget_unsecured_desc")}
                </span>
              </div>
            </div>

            <div>
              {state.hasMasterPassword ? (
                <button
                  className="quick-lock-button"
                  onClick={async (e) => {
                    e.currentTarget.classList.add("clicking");
                    try {
                      const { invoke } = await import("@tauri-apps/api/core");
                      await invoke("close_app_lock");
                      window.location.reload();
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(234, 67, 53, 0.4)",
                    background: "rgba(234, 67, 53, 0.1)",
                    color: "#ea4335",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  <Icon name="lock" size={15} />
                  <span>{t("security_widget_lock_btn")}</span>
                </button>
              ) : (
                <button
                  className="quick-lock-button setup"
                  onClick={onLockProfile}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "1px solid rgba(111, 92, 246, 0.4)",
                    background: "rgba(111, 92, 246, 0.1)",
                    color: "var(--accent-color, #5865f2)",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer"
                  }}
                >
                  <Icon name="shield" size={15} />
                  <span>{t("security_widget_setup_btn")}</span>
                </button>
              )}
            </div>
          </div>

          {active ? (
            <ActiveAccount
              profile={active}
              smartSwitchEnabled={state.settings.smart_switch_enabled}
              onToggleSmartSwitch={onToggleSmartSwitch}
              switchLevel={state.settings.switch_level}
              onSwitchLevelChange={onSwitchLevelChange}
              busy={busy}
              onOpenGuide={onOpenGuide}
            />

          ) : (
            <section className="inline-notice inline-notice--warning" role="status">
              <Icon name="alert" size={19} />
              <div>
                <strong>{t("no_active_account")}</strong>
                <p>{t("no_active_account_desc")}</p>
              </div>
            </section>
          )}

          <section aria-labelledby="saved-accounts-title" className="accounts-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{t("section_eyebrow")}</p>
                <h2 id="saved-accounts-title">
                  {otherProfiles.length > 0 ? t("section_title_other") : t("section_title_saved")}
                </h2>
                <p>{getProfilesCountLabel(otherProfiles.length)}</p>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  className="button button--secondary"
                  onClick={() => {
                    showMiniWindow().catch((err) =>
                      console.error("Failed to open mini window", err),
                    );
                  }}
                  type="button"
                >
                  <Icon name="mini" size={15} />
                  <span>{t("open_mini")}</span>
                </button>
                <button className="button button--primary" onClick={onAdd} type="button">
                  <Icon name="plus" size={17} />
                  <span>{t("add_account")}</span>
                </button>
              </div>
            </div>

            <div className="accounts-grid">
              {otherProfiles.map((profile) => (
                <AccountCard
                  busy={busy}
                  key={profile.profile_id}
                  onActivate={onActivate}
                  onDelete={onDelete}
                  profile={profile}
                />

              ))}
              <button className="add-account-card" onClick={onAdd} type="button">
                <span className="add-account-card__icon">
                  <Icon name="plus" size={22} />
                </span>
                <strong>{t("add_account")}</strong>
                <span>{t("import_current")}</span>
              </button>
            </div>
          </section>
        </>
      )}

      <footer
        className="dashboard-footer"
        style={{
          marginTop: "40px",
          paddingTop: "20px",
          borderTop: "1px solid var(--border-color, #2d3139)",
          opacity: 0.7,
          fontSize: "0.8em",
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
          <Icon name="shield" size={16} />
          <strong style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {disclaimer.title}
          </strong>
        </div>
        <p style={{ lineHeight: "1.5", marginBottom: "8px" }}>{disclaimer.body}</p>
        <p>
          <strong>{disclaimer.linksLabel}</strong>{" "}
          <a
            href="https://policies.google.com/terms"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline", color: "inherit", marginRight: "12px" }}
          >
            {disclaimer.tosLink}
          </a>
          <a
            href="https://ai.google.dev/gemini-api/terms"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline", color: "inherit", marginRight: "12px" }}
          >
            {disclaimer.geminiLink}
          </a>
          <a
            href="https://policies.google.com/terms"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: "underline", color: "inherit" }}
          >
            {disclaimer.fairUseLink}
          </a>
        </p>
      </footer>
    </div>
  );
}
