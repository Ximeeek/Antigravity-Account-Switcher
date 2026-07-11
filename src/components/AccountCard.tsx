import type { ProfileSummary } from "../types";
import { formatDateTime, getInitials, getTokenPresentation } from "../utils";
import { Icon } from "./Icons";
import { StatusPill } from "./StatusPill";

interface AccountCardProps {
  profile: ProfileSummary;
  busy?: boolean;
  onActivate: (profile: ProfileSummary) => void;
  onDelete: (profile: ProfileSummary) => void;
}

export function AccountCard({
  profile,
  busy = false,
  onActivate,
  onDelete,
}: AccountCardProps) {
  const token = getTokenPresentation(profile);

  return (
    <article className="account-card">
      <div className="account-card__top">
        <div className="profile-identity profile-identity--compact">
          <div className="profile-avatar" aria-hidden="true">
            {getInitials(profile.display_name)}
          </div>
          <div className="profile-identity__copy">
            <h3>{profile.display_name}</h3>
            {profile.account_email ? (
              <p className="profile-email" title={profile.account_email}>
                {profile.account_email}
              </p>
            ) : (
              <p className="profile-email profile-email--muted">E-mail ukryty</p>
            )}
          </div>
        </div>
        <button
          aria-label={`Usuń konto ${profile.display_name}`}
          className="icon-button icon-button--danger"
          disabled={busy}
          onClick={() => onDelete(profile)}
          title="Usuń konto"
          type="button"
        >
          <Icon name="trash" size={17} />
        </button>
      </div>

      <div className="account-card__status">
        <StatusPill tone={token.tone}>{token.label}</StatusPill>
        <span className="token-detail">{token.detail}</span>
      </div>

      <div className="account-card__meta">
        <Icon name="clock" size={15} />
        <span>Ostatnio używane: {formatDateTime(profile.last_activated_at)}</span>
      </div>

      <button
        className="button button--primary button--full"
        disabled={busy}
        onClick={() => onActivate(profile)}
        type="button"
      >
        {busy ? <Icon name="loader" size={16} /> : null}
        <span>Aktywuj</span>
      </button>
    </article>
  );
}
