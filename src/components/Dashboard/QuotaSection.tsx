/**
 * Quota section component for account details.
 * Renders individual model buckets and remaining fractions.
 * Main exports: QuotaSection
 */

import type { ProfileSummary } from "../../types";
import { Icon } from "../Icons";
import { t } from "../../i18n";

interface QuotaSectionProps {
  quota?: ProfileSummary["quota"];
}

export default function QuotaSection({ quota }: QuotaSectionProps) {
  if (!quota || !quota.quota_groups || quota.quota_groups.length === 0) return null;

  return (
    <div className="active-account-card__quotas">
      <p className="active-account-card__quotas-title">
        <Icon name="shield" size={15} />
        <span>{t("quota_usage_title")}</span>
      </p>
      <div className="quotas-list">
        {quota.quota_groups.map((group, gIdx) => (
          <div key={gIdx} className="quota-group">
            <span className="quota-group-name">{group.display_name}</span>
            <div className="quota-buckets-grid">
              {group.buckets.map((bucket, bIdx) => {
                const pct = Math.round(bucket.remaining_fraction * 100);
                const isLow = pct < 20;
                const isMedium = pct >= 20 && pct < 50;
                const tone = isLow ? "danger" : isMedium ? "warning" : "success";

                // Format reset time
                let resetLabel = "";
                if (bucket.reset_time && pct < 100) {
                  try {
                    const resetDate = new Date(bucket.reset_time);
                    const now = new Date();
                    const diffMs = resetDate.getTime() - now.getTime();
                    if (diffMs > 0) {
                      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                      const diffMinutes = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                      if (diffHours > 0) {
                        resetLabel = t("quota_refresh_in", { time: `${diffHours}h ${diffMinutes}m` });
                      } else {
                        resetLabel = t("quota_refresh_in", { time: `${diffMinutes}m` });
                      }
                    } else {
                      resetLabel = t("quota_full");
                    }
                  } catch (e) {
                    // Ignore parsing error
                  }
                } else {
                  resetLabel = t("quota_full");
                }

                let name = bucket.display_name;
                if (bucket.bucket_id === "gemini-weekly") {
                  name = t("quota_weekly_limit");
                } else if (bucket.bucket_id === "gemini-5h") {
                  name = t("quota_5h_limit");
                }

                return (
                  <div key={bIdx} className="quota-bucket">
                    <div className="quota-bucket__header">
                      <span className="quota-bucket__name">{name}</span>
                      <span className={`quota-bucket__pct quota-bucket__pct--${tone}`}>
                        {t("quota_remaining", { pct: String(pct) })}
                      </span>
                    </div>
                    <div className="quota-progress-bar">
                      <div
                        className={`quota-progress-bar__fill quota-progress-bar__fill--${tone}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {resetLabel && pct < 100 ? (
                      <span className="quota-bucket__reset">{resetLabel}</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
