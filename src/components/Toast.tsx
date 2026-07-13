/**
 * Action feedback Toast notification component.
 * Displays temporary success/error messages in the UI.
 * Main exports: Toast, Notice
 */

import { Icon } from "./Icons";
import { t } from "../i18n";

export interface Notice {
  tone: "success" | "danger" | "info";
  message: string;
}

interface ToastProps {
  notice: Notice;
  onClose: () => void;
}

export default function Toast({ notice, onClose }: ToastProps) {
  return (
    <div
      aria-atomic="true"
      className={`toast toast--${notice.tone}`}
      role={notice.tone === "danger" ? "alert" : "status"}
    >
      <span className="toast__icon">
        <Icon
          name={
            notice.tone === "success"
              ? "check"
              : notice.tone === "danger"
              ? "error"
              : "info"
          }
          size={17}
        />
      </span>
      <span>{notice.message}</span>
      <button aria-label={t("close_message")} onClick={onClose} type="button">
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}
