/**
 * Global quota summary averages.
 * Displays aggregated averages of 5h and weekly Gemini usage limits across all profiles.
 * Main exports: GlobalQuotaSummary
 */

import type { ProfileSummary } from "../../types";
import { Icon } from "../Icons";
import { t } from "../../i18n";

interface GlobalQuotaSummaryProps {
  profiles: ProfileSummary[];
}

export default function GlobalQuotaSummary({ profiles }: GlobalQuotaSummaryProps) {
  let sum5h = 0;
  let count5h = 0;
  let sumWeekly = 0;
  let countWeekly = 0;

  for (const p of profiles) {
    if (p.quota && p.quota.quota_groups) {
      for (const g of p.quota.quota_groups) {
        const fiveHour = g.buckets.find((b) => b.bucket_id === "gemini-5h");
        if (fiveHour && typeof fiveHour.remaining_fraction === "number") {
          sum5h += fiveHour.remaining_fraction;
          count5h++;
        }
        const weekly = g.buckets.find((b) => b.bucket_id === "gemini-weekly");
        if (weekly && typeof weekly.remaining_fraction === "number") {
          sumWeekly += weekly.remaining_fraction;
          countWeekly++;
        }
      }
    }
  }

  if (count5h === 0 && countWeekly === 0) return null;

  const avg5h = count5h > 0 ? Math.round((sum5h / count5h) * 100) : null;
  const avgWeekly = countWeekly > 0 ? Math.round((sumWeekly / countWeekly) * 100) : null;

  return (
    <div className="global-quota-summary">
      <div className="global-quota-summary__title">
        <Icon name="accounts" size={16} />
        <span>{t("global_quota_title")}</span>
      </div>
      <div className="global-quota-summary__grids">
        {avg5h !== null && (
          <div className="global-quota-item">
            <span className="global-quota-item__label">{t("quota_5h_limit")} (Global)</span>
            <div className="global-quota-item__value-bar">
              <strong>{avg5h}%</strong>
              <div className="global-quota-bar">
                <div
                  className={`global-quota-bar__fill global-quota-bar__fill--${
                    avg5h < 20 ? "danger" : avg5h < 50 ? "warning" : "success"
                  }`}
                  style={{ width: `${avg5h}%` }}
                />
              </div>
            </div>
          </div>
        )}
        {avgWeekly !== null && (
          <div className="global-quota-item">
            <span className="global-quota-item__label">{t("quota_weekly_limit")} (Global)</span>
            <div className="global-quota-item__value-bar">
              <strong>{avgWeekly}%</strong>
              <div className="global-quota-bar">
                <div
                  className={`global-quota-bar__fill global-quota-bar__fill--${
                    avgWeekly < 20 ? "danger" : avgWeekly < 50 ? "warning" : "success"
                  }`}
                  style={{ width: `${avgWeekly}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
