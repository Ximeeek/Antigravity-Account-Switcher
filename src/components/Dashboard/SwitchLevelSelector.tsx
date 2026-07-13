import { useState, useEffect, useRef } from "react";
import { t } from "../../i18n";

interface SwitchLevelSelectorProps {
  value: number; // 1 or 2
  onChange: (value: number) => void;
  busy?: boolean; // Kept in interface for props compatibility
}

export default function SwitchLevelSelector({
  value,
  onChange,
}: SwitchLevelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  // Optimistic update: sync local value when backend value updates
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Click outside to close popover
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const [hasChanged, setHasChanged] = useState(() => {
    return localStorage.getItem("antigravity_switch_level_changed") === "true";
  });

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    setLocalValue(newValue); // Instant optimistic update on frontend!
    onChange(newValue);      // Propagate change to backend
    if (!hasChanged) {
      setHasChanged(true);
      localStorage.setItem("antigravity_switch_level_changed", "true");
    }
  };

  const togglePopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const snapPoints = ["11px", "calc(100% - 11px)"];
  const thumbLeft = localValue === 1 ? snapPoints[0] : snapPoints[1];
  const activePercentage = localValue === 1 ? "0%" : "100%"; // 0% at Lvl 1 completely hides the blue sliver!

  return (
    <div className="switch-mode-popover-container" ref={containerRef}>
      {/* Trigger Button - Always interactive */}
      <button
        type="button"
        className={`switch-mode-trigger ${isOpen ? "switch-mode-trigger--active" : ""} ${!hasChanged ? "switch-mode-trigger--pulse" : ""}`}
        onClick={togglePopover}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <span className="switch-mode-trigger__text">{t("switch_mode")}</span>
        <span className="switch-mode-trigger__badge">{value === 1 ? "Lvl 1" : "Lvl 2"}</span>
      </button>

      {/* Floating Popover Box */}
      {isOpen && (
        <div className="switch-mode-popover-box" role="dialog" aria-label={t("switch_mode")}>
          {/* Popover Header showing: Restart Type (Left) & Speed Multiplier (Right) */}
          <div className="switch-mode-popover-header">
            <span className="popover-header-left">
              {localValue === 1 ? t("switch_level_1_short") : t("switch_level_2_short")}
            </span>
            <span className={`popover-header-right ${localValue === 2 ? "speed-highlight" : "slow-highlight"}`}>
              {localValue === 2 ? t("switch_level_faster") : t("slower")}
            </span>
          </div>

          {/* Compact Slider Track */}
          <div className="compact-slider-track-container">
            <div className="compact-slider-track-bg">
              {/* Glowing Active Track Fill */}
              <div
                className="compact-slider-track-fill"
                style={{ width: activePercentage }}
              />
            </div>

            {/* Snapping Dots */}
            <div className={`compact-slider-dot ${localValue >= 1 ? "compact-slider-dot--active" : ""}`} style={{ left: "11px" }} />
            <div className={`compact-slider-dot ${localValue >= 2 ? "compact-slider-dot--active" : ""}`} style={{ left: "calc(100% - 11px)" }} />

            {/* Custom Sliding Thumb */}
            <div
              className="compact-slider-thumb"
              style={{ left: thumbLeft }}
            />

            {/* Accessible Native Range Input Overlay */}
            <input
              type="range"
              min="1"
              max="2"
              step="1"
              value={localValue}
              onChange={handleSliderChange}
              className="compact-slider-native-input"
              aria-valuemin={1}
              aria-valuemax={2}
              aria-valuenow={localValue}
              aria-valuetext={localValue === 1 ? t("switch_level_1") : t("switch_level_2")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
