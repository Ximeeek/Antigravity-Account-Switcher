/**
 * Dashboard root view.
 * Integrates quota, active profile hero, saved profiles grid, and disclaimer footer.
 * Main exports: Dashboard
 */

import { useState } from "react";
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

  const [bannerCollapsed, setBannerCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("switcher_security_banner_collapsed") === "true";
    }
    return false;
  });

  const handleToggleBanner = () => {
    const next = !bannerCollapsed;
    localStorage.setItem("switcher_security_banner_collapsed", String(next));
    setBannerCollapsed(next);
  };

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
          <div 
            className={`security-status-widget ${bannerCollapsed ? "minimized" : "expanded"}`}
            onClick={bannerCollapsed ? handleToggleBanner : undefined}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: bannerCollapsed ? "8px 16px" : "12px 16px",
              borderRadius: "8px",
              background: "var(--background-secondary, #161920)",
              border: "1px solid var(--border-color, #2d3139)",
              borderLeft: state.hasMasterPassword 
                ? "4px solid #23a55a" 
                : "4px solid #f0b232",
              boxShadow: bannerCollapsed ? "none" : "0 4px 15px rgba(0, 0, 0, 0.2)",
              marginBottom: "20px",
              cursor: bannerCollapsed ? "pointer" : "default",
              position: "relative",
              height: bannerCollapsed ? "36px" : "62px",
              transition: "height 0.25s cubic-bezier(0.16, 1, 0.3, 1), padding 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease",
              overflow: "hidden",
              boxSizing: "border-box"
            }}
          >
            {/* Minimized Content */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: bannerCollapsed ? 1 : 0,
              pointerEvents: bannerCollapsed ? "auto" : "none",
              transform: bannerCollapsed ? "translateY(0)" : "translateY(-10px)",
              transition: "opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon 
                  name="shield" 
                  size={14} 
                  style={{ color: state.hasMasterPassword ? "#23a55a" : "#f0b232" }} 
                />
                <strong style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                  {state.hasMasterPassword 
                    ? t("security_widget_secure_short") 
                    : t("security_widget_unsecured_short")}
                </strong>
                {state.hasMasterPassword && (
                  <span style={{ 
                    fontSize: "8px", 
                    padding: "0 4px", 
                    borderRadius: "3px", 
                    background: "rgba(35, 165, 90, 0.12)", 
                    color: "#23a55a", 
                    fontWeight: 700 
                  }}>
                    AES-256
                  </span>
                )}
              </div>
              
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
                  {t("security_widget_expand")}
                </span>
                <Icon name="chevron-down" size={14} style={{ color: "var(--text-muted)" }} />
              </div>
            </div>

            {/* Expanded Content */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: bannerCollapsed ? 0 : 1,
              pointerEvents: bannerCollapsed ? "none" : "auto",
              transform: bannerCollapsed ? "translateY(10px)" : "translateY(0)",
              transition: "opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                <div 
                  className={state.hasMasterPassword ? "shield-glow-success" : "shield-glow-warning"}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: state.hasMasterPassword ? "rgba(35, 165, 90, 0.1)" : "rgba(240, 178, 50, 0.1)",
                    color: state.hasMasterPassword ? "#23a55a" : "#f0b232",
                    flexShrink: 0
                  }}
                >
                  <Icon name="shield" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                      {state.hasMasterPassword ? t("security_widget_secure") : t("security_widget_unsecured")}
                    </strong>
                    {state.hasMasterPassword && (
                      <span style={{ 
                        fontSize: "9px", 
                        padding: "1px 5px", 
                        borderRadius: "4px", 
                        background: "rgba(35, 165, 90, 0.12)", 
                        color: "#23a55a", 
                        fontWeight: 700
                      }}>
                        AES-256
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {state.hasMasterPassword 
                      ? t("security_widget_secure_desc")
                      : t("security_widget_unsecured_desc")}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                {state.hasMasterPassword ? (
                  <button
                    className="quick-lock-button"
                    onClick={async (e) => {
                      e.stopPropagation();
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
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(234, 67, 53, 0.3)",
                      background: "rgba(234, 67, 53, 0.08)",
                      color: "#ea4335",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <Icon name="lock" size={14} />
                    <span>{t("security_widget_lock_btn")}</span>
                  </button>
                ) : (
                  <button
                    className="quick-lock-button setup"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLockProfile?.();
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid rgba(72, 137, 244, 0.3)",
                      background: "rgba(72, 137, 244, 0.08)",
                      color: "#4889f4",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <Icon name="shield" size={14} />
                    <span>{t("security_widget_setup_btn")}</span>
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleBanner();
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    color: "var(--text-muted, #72767d)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "4px",
                    transition: "all 0.15s ease"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text-primary)";
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.background = "none";
                  }}
                  title={t("security_widget_collapse")}
                >
                  <Icon name="chevron-down" size={14} style={{ transform: "rotate(180deg)" }} />
                </button>
              </div>
            </div>
          </div>
          <GlobalQuotaSummary profiles={state.profiles} />

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
