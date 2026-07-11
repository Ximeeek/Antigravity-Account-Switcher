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
            <p className="eyebrow">Aktywne konto</p>
            <StatusPill tone="success">Aktywne</StatusPill>
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
                <p className="profile-email profile-email--muted">Adres e-mail jest ukryty</p>
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
              <span className="fact-label">Uwierzytelnianie</span>
              <StatusPill tone={token.tone}>{token.label}</StatusPill>
              <span className="fact-detail">{token.detail}</span>
            </div>
          </div>
          <div className="active-fact">
            <div className="fact-icon fact-icon--info">
              <Icon name="clock" size={18} />
            </div>
            <div>
              <span className="fact-label">Ostatnia aktywacja</span>
              <strong>{formatDateTime(profile.last_activated_at)}</strong>
              <span className="fact-detail">Kontekst profilu jest zachowany</span>
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
      <p className="eyebrow">Pierwszy krok</p>
      <h1 id="empty-state-title">Dodaj swoje pierwsze konto</h1>
      <p>
        Zapisz aktualnie zalogowany profil Antigravity, aby później przełączać konto
        bez utraty historii i ustawień.
      </p>
      <button className="button button--primary" onClick={onAdd} type="button">
        <Icon name="plus" size={17} />
        <span>Dodaj bieżące konto</span>
      </button>
      <div className="empty-state__hint">
        <Icon name="shield" size={16} />
        <span>Dane profilu pozostają lokalnie na tym komputerze.</span>
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
                <strong>Nie wykryto aktywnego konta</strong>
                <p>Wybierz jeden z zapisanych profili, aby ustawić go jako aktywny.</p>
              </div>
            </section>
          )}

          <section aria-labelledby="saved-accounts-title" className="accounts-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Profile lokalne</p>
                <h2 id="saved-accounts-title">
                  {otherProfiles.length > 0 ? "Pozostałe konta" : "Zapisane konta"}
                </h2>
                <p>
                  {otherProfiles.length === 0
                    ? "Brak innych zapisanych profili"
                    : otherProfiles.length === 1
                      ? "1 profil gotowy do przełączenia"
                      : `${otherProfiles.length} profile gotowe do przełączenia`}
                </p>
              </div>
              <button className="button button--secondary" onClick={onAdd} type="button">
                <Icon name="plus" size={17} />
                <span>Dodaj konto</span>
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
                <strong>Dodaj konto</strong>
                <span>Importuj bieżący profil Antigravity</span>
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
