import { useState, useEffect, useRef } from "react";
import { t } from "../../i18n";
import { Modal } from "../Modal";

interface SwitchLevelSelectorProps {
  value: number; // 1, 2, 3, or 4 (1=Lvl1, 4=Lvl1+, 2=Lvl2, 3=Lvl2+)
  onChange: (value: number) => void;
  busy?: boolean; // Kept in interface for props compatibility
}

export default function SwitchLevelSelector({
  value,
  onChange,
}: SwitchLevelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mappers between backend value and slider value (1=Lvl1, 2=Lvl1+, 3=Lvl2, 4=Lvl2+)
  const backendToSlider = (val: number): number => {
    switch (val) {
      case 1: return 1; // Level 1 (Full)
      case 4: return 2; // Level 1+ (Optimized Full)
      case 2: return 3; // Level 2 (Fast)
      case 3: return 4; // Level 2+ / 3 (Patched Fast)
      default: return 1;
    }
  };

  const sliderToBackend = (val: number): number => {
    switch (val) {
      case 1: return 1;
      case 2: return 4;
      case 3: return 2;
      case 4: return 3;
      default: return 1;
    }
  };

  const [localSliderValue, setLocalSliderValue] = useState(() => backendToSlider(value));
  const pendingSliderValue = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush any pending optimistic save immediately
  const flushChange = useRef<() => void>(() => {});
  flushChange.current = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingSliderValue.current !== null) {
      onChange(sliderToBackend(pendingSliderValue.current));
      pendingSliderValue.current = null;
    }
  };

  // Optimistic update: sync local value when backend value updates,
  // but ONLY if we do not have a pending local change in flight!
  useEffect(() => {
    const expectedSliderVal = backendToSlider(value);
    if (pendingSliderValue.current === expectedSliderVal) {
      pendingSliderValue.current = null;
    }
    if (pendingSliderValue.current === null) {
      setLocalSliderValue(expectedSliderVal);
    }
  }, [value]);

  // Flush pending changes on unmount
  useEffect(() => {
    return () => {
      if (pendingSliderValue.current !== null) {
        flushChange.current();
      }
    };
  }, []);

  // Click outside to close popover and flush changes
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        flushChange.current();
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

  const [showWarningModal, setShowWarningModal] = useState(false);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    setLocalSliderValue(newValue); // Instant optimistic update on frontend!
    pendingSliderValue.current = newValue;

    // Debounce the Tauri IPC call by 150ms to allow smooth sliding/dragging
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (pendingSliderValue.current !== null) {
        onChange(sliderToBackend(pendingSliderValue.current));
      }
    }, 150);

    if (!hasChanged) {
      setHasChanged(true);
      localStorage.setItem("antigravity_switch_level_changed", "true");
    }

    if ((newValue === 3 || newValue === 4) && localStorage.getItem("antigravity_level_2_warning_shown") !== "true") {
      setShowWarningModal(true);
    }
  };

  const togglePopover = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen) {
      flushChange.current();
    }
    setIsOpen((prev) => !prev);
  };

  const snapPoints = ["11px", "25%", "75%", "calc(100% - 11px)"];
  const thumbLeft = localSliderValue === 1 ? snapPoints[0] : (localSliderValue === 2 ? snapPoints[1] : (localSliderValue === 3 ? snapPoints[2] : snapPoints[3]));
  const activePercentage = localSliderValue === 1 ? "0%" : (localSliderValue === 2 ? "25%" : (localSliderValue === 3 ? "75%" : "100%"));

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
        <span className="switch-mode-trigger__badge">
          {localSliderValue === 1 ? "Lvl 1" : 
           (localSliderValue === 2 ? <>Lvl 1<span className="epic-plus">+</span></> : 
           (localSliderValue === 3 ? "Lvl 2" : <>Lvl 2<span className="epic-plus">+</span></>))}
        </span>
      </button>

      {/* Floating Popover Box */}
      {isOpen && (
        <div className="switch-mode-popover-box" role="dialog" aria-label={t("switch_mode")}>
          {/* Popover Header showing: Restart Type (Left) & Speed Multiplier (Right) */}
          <div className="switch-mode-popover-header">
            <span className="popover-header-left">
              {localSliderValue === 1 ? t("switch_level_1_short") : 
               (localSliderValue === 2 ? t("switch_level_4_short") : 
               (localSliderValue === 3 ? t("switch_level_2_short") : t("switch_level_3_short")))}
            </span>
            <span className={`popover-header-right ${localSliderValue > 1 ? "speed-highlight" : "slow-highlight"}`}>
              {localSliderValue === 1 ? t("slower") : 
               (localSliderValue === 2 ? t("switch_level_optimized") : 
               (localSliderValue === 3 ? t("switch_level_faster") : t("switch_level_blazing")))}
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
            <div className={`compact-slider-dot ${localSliderValue >= 1 ? "compact-slider-dot--active" : ""}`} style={{ left: "11px" }} />
            <div className={`compact-slider-dot ${localSliderValue >= 2 ? "compact-slider-dot--active" : ""}`} style={{ left: "25%" }} />
            <div className={`compact-slider-dot ${localSliderValue >= 3 ? "compact-slider-dot--active" : ""}`} style={{ left: "75%" }} />
            <div className={`compact-slider-dot ${localSliderValue >= 4 ? "compact-slider-dot--active" : ""}`} style={{ left: "calc(100% - 11px)" }} />

            {/* Custom Sliding Thumb */}
            <div
              className="compact-slider-thumb"
              style={{ left: thumbLeft }}
            />

            {/* Accessible Native Range Input Overlay */}
            <input
              type="range"
              min="1"
              max="4"
              step="1"
              value={localSliderValue}
              onChange={handleSliderChange}
              className="compact-slider-native-input"
              aria-valuemin={1}
              aria-valuemax={4}
              aria-valuenow={localSliderValue}
              aria-valuetext={
                localSliderValue === 1 ? t("switch_level_1") : 
                (localSliderValue === 2 ? t("switch_level_4") : 
                (localSliderValue === 3 ? t("switch_level_2") : t("switch_level_3")))
              }
            />
          </div>
        </div>
      )}

      <Modal
        open={showWarningModal}
        onClose={() => {
          localStorage.setItem("antigravity_level_2_warning_shown", "true");
          setShowWarningModal(false);
        }}
        title={t("level_2_warning_title")}
        footer={
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              localStorage.setItem("antigravity_level_2_warning_shown", "true");
              setShowWarningModal(false);
            }}
          >
            {t("level_2_warning_btn")}
          </button>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="compact-alert compact-alert--warning" style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px", margin: 0 }}>
            <strong>{t("level_2_warning_title")}</strong>
            <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5" }}>
              {t("level_2_warning_desc")}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
