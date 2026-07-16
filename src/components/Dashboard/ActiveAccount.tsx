/**
 * Active account section.
 * Renders details, status, and sub-quotas of the currently active account.
 * Main exports: ActiveAccount
 */

import { useEffect, useRef } from "react";
import type { ProfileSummary } from "../../types";
import { getTokenPresentation, getInitials, formatDateTime } from "../../utils";
import { Icon } from "../Icons";
import { StatusPill } from "../StatusPill";
import { t } from "../../i18n";
import QuotaSection from "./QuotaSection";
import SwitchLevelSelector from "./SwitchLevelSelector";

interface ActiveAccountProps {
  profile: ProfileSummary;
  smartSwitchEnabled: boolean;
  onToggleSmartSwitch: () => void;
  switchLevel: number;
  onSwitchLevelChange: (level: number) => void;
  busy?: boolean;
  onOpenGuide?: () => void;
  onLock?: (profile: ProfileSummary) => void;
  onUnlock?: (profile: ProfileSummary) => void;
  onRemoveLock?: (profile: ProfileSummary) => void;
}

export default function ActiveAccount({
  profile,
  smartSwitchEnabled,
  onToggleSmartSwitch,
  switchLevel,
  onSwitchLevelChange,
  busy = false,
  onOpenGuide,
  onLock,
  onUnlock,
  onRemoveLock,
}: ActiveAccountProps) {

  const token = getTokenPresentation(profile);
  const cardRef = useRef<HTMLElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const card = cardRef.current;
    const glow = glowRef.current;
    if (!card || !glow) return;

    let currentX = 0;
    let currentY = 0;
    let currentScale = 0.9;
    let currentOpacity = 0.28;

    let targetX = 0;
    let targetY = 0;
    let targetScale = 0.9;
    let targetOpacity = 0.28;

    let mouseX = -9999;
    let mouseY = -9999;
    let isNear = false;
    let wasNear = false;
    let lastTime = 0;
    let theta = 0;
    let lastInteractionTime = Date.now();

    let rect = card.getBoundingClientRect();
    const updateRect = () => {
      rect = card.getBoundingClientRect();
    };

    let lastMouseX = -9999;
    let lastMouseY = -9999;

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientX === lastMouseX && e.clientY === lastMouseY) {
        return;
      }
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      mouseX = e.clientX;
      mouseY = e.clientY;
      lastInteractionTime = Date.now();
      startAnimation();
    };

    const handleMouseLeave = () => {
      mouseX = -9999;
      mouseY = -9999;
      lastInteractionTime = Date.now();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("resize", updateRect);

    let animationFrameId: number;
    let isAnimating = false;

    const tick = (timestamp: number) => {
      if (!isAnimating) return;

      // Sleep loop after 10s of inactivity to achieve 0% idle CPU
      if (Date.now() - lastInteractionTime > 10000) {
        stopAnimation();
        return;
      }

      if (!lastTime) lastTime = timestamp;
      const dt = (timestamp - lastTime) / 1000;
      lastTime = timestamp;

      if (mouseX !== -9999 && mouseY !== -9999) {
        const dx = Math.max(rect.left - mouseX, 0, mouseX - rect.right);
        const dy = Math.max(rect.top - mouseY, 0, mouseY - rect.bottom);
        const distance = Math.sqrt(dx * dx + dy * dy);
        isNear = distance < 80;
      } else {
        isNear = false;
      }

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // Dynamic radius breathing to simulate random drifting path
      const rxBase = rect.width / 2 + 40;
      const ryBase = rect.height / 2 + 25;
      const rx = rxBase + Math.sin(timestamp / 1200) * 35;
      const ry = ryBase + Math.cos(timestamp / 1200) * 20;

      // Snapping theta to the closest angle on the orbit ellipse when user moves the mouse away
      if (wasNear && !isNear) {
        theta = Math.atan2((currentY - centerY) / ry, (currentX - centerX) / rx);
      }
      wasNear = isNear;

      // Slower lerping factors (0.02 for orbit, 0.075 for following) for organic liquid movement
      let lerpFactor = 0.02;

      if (isNear) {
        targetX = mouseX - rect.left;
        targetY = mouseY - rect.top;
        targetScale = 1.15;
        targetOpacity = 0.48;
        lerpFactor = 0.075;
      } else {
        // Speed fluctuations (sometimes slows down, pauses, or drifts backward)
        const speedVal = 0.16 + Math.sin(timestamp / 1600) * 0.18 + Math.cos(timestamp / 900) * 0.1;
        theta += speedVal * dt;

        targetX = centerX + rx * Math.cos(theta);
        targetY = centerY + ry * Math.sin(theta);
        targetScale = 0.9;
        targetOpacity = 0.28;
      }

      currentX += (targetX - currentX) * lerpFactor;
      currentY += (targetY - currentY) * lerpFactor;
      currentScale += (targetScale - currentScale) * 0.1;
      currentOpacity += (targetOpacity - currentOpacity) * 0.1;

      // Update center glow position & scale
      glow.style.transform = `translate3d(${currentX.toFixed(1)}px, ${currentY.toFixed(1)}px, 0) scale(${currentScale.toFixed(2)})`;
      glow.style.opacity = currentOpacity.toFixed(3);

      // Only update x and y coordinates on card style to avoid parsing whole gradient strings
      card.style.setProperty("--glow-x", `${currentX.toFixed(1)}px`);
      card.style.setProperty("--glow-y", `${currentY.toFixed(1)}px`);

      animationFrameId = requestAnimationFrame(tick);
    };

    const startAnimation = () => {
      if (!isAnimating && !prefersReducedMotion && document.hasFocus() && document.visibilityState === "visible") {
        isAnimating = true;
        lastTime = 0;
        animationFrameId = requestAnimationFrame(tick);
      }
    };

    const stopAnimation = () => {
      if (isAnimating) {
        isAnimating = false;
        cancelAnimationFrame(animationFrameId);
      }
    };

    const handleFocus = () => {
      updateRect();
      lastInteractionTime = Date.now();
      startAnimation();
    };

    const handleBlur = () => {
      stopAnimation();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateRect();
        lastInteractionTime = Date.now();
        startAnimation();
      } else {
        stopAnimation();
      }
    };

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let prefersReducedMotion = mediaQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion = e.matches;
      if (prefersReducedMotion) {
        stopAnimation();
      } else {
        startAnimation();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    mediaQuery.addEventListener("change", handleMotionChange);

    if (!prefersReducedMotion) {
      startAnimation();
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      mediaQuery.removeEventListener("change", handleMotionChange);
      stopAnimation();
    };
  }, []);

  return (
    <section ref={cardRef} aria-labelledby="active-account-title" className="active-account-card">
      <div className="active-account-card__glow-container" aria-hidden="true">
        <div ref={glowRef} className="active-account-card__glow" />
      </div>
      <div className="active-account-card__content">
        <div className="active-account-card__identity">
          <div
            className="active-account-card__label-row"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <p className="eyebrow">{t("active_account")}</p>
              <StatusPill tone="success">{t("active")}</StatusPill>
              {onOpenGuide && (
                <button
                  type="button"
                  onClick={onOpenGuide}
                  title={t("about_tab_guide")}
                  style={{
                    background: "none",
                    border: "none",
                    padding: "4px",
                    margin: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-secondary, #8e9297)",
                    cursor: "pointer",
                    borderRadius: "50%",
                    transition: "all 0.2s ease-out",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--accent-blue, #5865f2)";
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-secondary, #8e9297)";
                    e.currentTarget.style.background = "none";
                  }}
                >
                  <Icon name="info" size={13} />
                </button>
              )}
            </div>

            <div
              style={{ display: "flex", alignItems: "center", gap: "16px" }}
              className="active-account-controls"
            >              <SwitchLevelSelector
                value={switchLevel}
                onChange={onSwitchLevelChange}
                busy={busy}
              />

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
                      ? "var(--accent-blue, #4a8cf7)"
                      : "var(--text-secondary, #8e9297)",
                    fontWeight: 600,
                    transition: "color 250ms ease-out",
                  }}
                >
                  Smart Switch
                </span>
                <button
                  type="button"
                  onClick={onToggleSmartSwitch}
                  className={`smart-switch-toggle ${smartSwitchEnabled ? "smart-switch-toggle--active" : ""}`}
                  title={t("smart_switch_hint")}
                >
                  <div className="smart-switch-toggle__thumb" />
                </button>
              </div>
            </div>
          </div>
          <div className="profile-identity profile-identity--hero">
            <div className="profile-avatar profile-avatar--large" aria-hidden="true">
              {getInitials(profile.display_name)}
            </div>
            <div className="profile-identity__copy">
              <h1 id="active-account-title" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {profile.display_name}
              </h1>

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
