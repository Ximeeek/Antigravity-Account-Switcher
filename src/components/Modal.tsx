import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icons";

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  eyebrow?: string;
  icon?: ReactNode;
  className?: string;
  onClose: () => void;
  closeLabel?: string;
  dismissible?: boolean;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  eyebrow,
  icon,
  className = "",
  onClose,
  closeLabel = "Zamknij okno",
  dismissible = true,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      target?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [dismissible, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      aria-hidden="false"
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (dismissible && event.currentTarget === event.target) onClose();
      }}
    >
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`modal-panel ${className}`}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="modal-header">
          <div className="modal-heading-wrap">
            {icon ? <div className="modal-icon">{icon}</div> : null}
            <div>
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              <h2 id={titleId}>{title}</h2>
              {description ? (
                <p className="modal-description" id={descriptionId}>
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {dismissible ? (
            <button
              aria-label={closeLabel}
              className="icon-button modal-close"
              onClick={onClose}
              type="button"
            >
              <Icon name="close" />
            </button>
          ) : null}
        </div>
        <div className="modal-content">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
