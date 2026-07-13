/**
 * Empty dashboard state component.
 * Prompts the user to register their first profile.
 * Main exports: EmptyState
 */

import { Icon } from "../Icons";
import { t } from "../../i18n";

interface EmptyStateProps {
  onAdd: () => void;
}

export default function EmptyState({ onAdd }: EmptyStateProps) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <div className="empty-state__illustration" aria-hidden="true">
        <div className="empty-orbit empty-orbit--outer" />
        <div className="empty-orbit empty-orbit--inner" />
        <div className="empty-state__icon">
          <Icon name="user" size={29} />
          <span className="empty-state__plus">
            <Icon name="plus" size={13} />
          </span>
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
