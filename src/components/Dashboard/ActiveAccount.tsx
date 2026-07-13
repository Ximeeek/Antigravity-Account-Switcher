/**
 * Active account section.
 * Renders details, status, and sub-quotas of the currently active account.
 * Main exports: ActiveAccount
 */

import type { ProfileSummary } from "../../types";
import { getTokenPresentation, getInitials, formatDateTime } from "../../utils";
import { Icon } from "../Icons";
import { StatusPill } from "../StatusPill";
import { t } from "../../i18n";
import QuotaSection from "./QuotaSection";

interface ActiveAccountProps {
  profile: ProfileSummary;
  smartSwitchEnabled: boolean;
  onToggleSmartSwitch: () => void;
}

export default function ActiveAccount({
  profile,
  smartSwitchEnabled,
  onToggleSmartSwitch,
}: ActiveAccountProps) {
  const token = getTokenPresentation(profile);

  return (
    <section aria-labelledby="active-account-title" className="active-account-card">
      <div className="active-account-card__glow" aria-hidden="true" />
      <div className="active-account-card__content">
        <div className="active-account-card__identity">
          <div
            className="active-account-card__label-row"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <p className="eyebrow">{t("active_account")}</p>
              <StatusPill tone="success">{t("active")}</StatusPill>
            </div>

            <div
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
              className="smart-switch-quick-toggle"
            >
              <span
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: smartSwitchEnabled
                    ? "var(--accent-color, #5865f2)"
                    : "var(--text-secondary, #8e9297)",
                  fontWeight: 600,
                }}
              >
                Smart Switch
              </span>
              <button
                type="button"
                onClick={onToggleSmartSwitch}
                style={{
                  width: "36px",
                  height: "20px",
                  borderRadius: "10px",
                  backgroundColor: smartSwitchEnabled ? "var(--accent-color, #5865f2)" : "#2d3139",
                  border: "none",
                  position: "relative",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                  padding: 0,
                }}
                title={t("smart_switch_hint")}
              >
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "50%",
                    backgroundColor: "#fff",
                    position: "absolute",
                    top: "3px",
                    left: smartSwitchEnabled ? "19px" : "3px",
                    transition: "left 0.2s",
                  }}
                />
              </button>
            </div>
          </div>
          <div className="profile-identity profile-identity--hero">
            <div className="profile-avatar profile-avatar--large" aria-hidden="true">
              {getInitials(profile.display_name)}
            </div>
            <div className="profile-identity__copy">
              <h1 id="active-account-title">{profile.display_name}</h1>
              {profile.account_email ? (
                <p className="profile-email" title={profile.account_email}>
                  <Icon name="mail" size={15} />
                  <span>{profile.account_email}</span>
                </p>
              ) : (
                <p className="profile-email profile-email--muted">{t("email_hidden")}</p>
              )}
            </div>
          </div>
        </div>

        <div className="active-account-card__facts">
          <div className="active-fact">
            <div className={`fact-icon fact-icon--${token.tone}`}>
              <Icon name="key" size={18} />
            </div>
            <div>
              <span className="fact-label">{t("fact_auth")}</span>
              <StatusPill tone={token.tone}>{token.label}</StatusPill>
              <span className="fact-detail">{token.detail}</span>
            </div>
          </div>
          <div className="active-fact">
            <div className="fact-icon fact-icon--info">
              <Icon name="clock" size={18} />
            </div>
            <div>
              <span className="fact-label">{t("fact_last_active")}</span>
              <strong>{formatDateTime(profile.last_activated_at)}</strong>
              <span className="fact-detail">{t("fact_context_kept")}</span>
            </div>
          </div>
        </div>

        <QuotaSection quota={profile.quota} />
      </div>
    </section>
  );
}
