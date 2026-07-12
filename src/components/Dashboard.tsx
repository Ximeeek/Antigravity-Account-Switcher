import type { AppState, ProfileSummary } from "../types";
import {
  formatDateTime,
  getInitials,
  getTokenPresentation,
  getDisclaimerText,
} from "../utils";
import { AccountCard } from "./AccountCard";
import { Icon } from "./Icons";
import { StatusPill } from "./StatusPill";
import { t } from "../i18n";

interface DashboardProps {
  state: AppState;
  busy?: boolean;
  onActivate: (profile: ProfileSummary) => void;
  onAdd: () => void;
  onDelete: (profile: ProfileSummary) => void;
}

function ActiveAccount({ profile }: { profile: ProfileSummary }) {
  const token = getTokenPresentation(profile);

  return (
    <section aria-labelledby="active-account-title" className="active-account-card">
      <div className="active-account-card__glow" aria-hidden="true" />
      <div className="active-account-card__content">
        <div className="active-account-card__identity">
          <div className="active-account-card__label-row">
            <p className="eyebrow">{t("active_account")}</p>
            <StatusPill tone="success">{t("active")}</StatusPill>
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
      </div>
    </section>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <div className="empty-state__illustration" aria-hidden="true">
        <div className="empty-orbit empty-orbit--outer" />
        <div className="empty-orbit empty-orbit--inner" />
        <div className="empty-state__icon">
          <Icon name="user" size={29} />
          <span className="empty-state__plus"><Icon name="plus" size={13} /></span>
        </div>
      </div>
      <p className="eyebrow">{t("empty_eyebrow")}</p>
      <h1 id="empty-state-title">{t("empty_title")}</h1>
      <p>{t("empty_desc")}</p>
      <button className="button button--primary" onClick={onAdd} type="button">
        <Icon name="plus" size={17} />
        <span>{t("empty_button")}</span>
      </button>
      <div className="empty-state__hint">
        <Icon name="shield" size={16} />
        <span>{t("empty_hint")}</span>
      </div>
    </section>
  );
}

export function Dashboard({
  state,
  busy = false,
  onActivate,
  onAdd,
  onDelete,
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
          {active ? (
            <ActiveAccount profile={active} />
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
              <button className="button button--secondary" onClick={onAdd} type="button">
                <Icon name="plus" size={17} />
                <span>{t("add_account")}</span>
              </button>
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
                <span className="add-account-card__icon"><Icon name="plus" size={22} /></span>
                <strong>{t("add_account")}</strong>
                <span>{t("import_current")}</span>
              </button>
            </div>
          </section>
        </>
      )}

      <footer className="dashboard-footer" style={{ marginTop: "40px", paddingTop: "20px", borderTop: "1px solid var(--border-color, #2d3139)", opacity: 0.7, fontSize: "0.8em" }}>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "6px" }}>
          <Icon name="shield" size={16} />
          <strong style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>{disclaimer.title}</strong>
        </div>
        <p style={{ lineHeight: "1.5", marginBottom: "8px" }}>{disclaimer.body}</p>
        <p>
          <strong>{disclaimer.linksLabel}</strong>{" "}
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit", marginRight: "12px" }}>{disclaimer.tosLink}</a>
          <a href="https://ai.google.dev/gemini-api/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit", marginRight: "12px" }}>{disclaimer.geminiLink}</a>
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" style={{ textDecoration: "underline", color: "inherit" }}>{disclaimer.fairUseLink}</a>
        </p>
      </footer>
    </div>
  );
}
