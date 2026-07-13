/**
 * App loading error screen component.
 * Rendered when backend connection or state retrieval fails during startup.
 * Main exports: LoadError
 */

import { Icon } from "./Icons";
import { t } from "../i18n";

interface LoadErrorProps {
  message: string;
  onRetry: () => void;
}

export default function LoadError({ message, onRetry }: LoadErrorProps) {
  return (
    <main className="boot-screen boot-screen--error">
      <div className="boot-screen__mark">
        <Icon name="error" size={27} />
      </div>
      <h1>{t("app_load_failed")}</h1>
      <p>{message}</p>
      <button className="button button--primary" onClick={onRetry} type="button">
        <Icon name="refresh" size={16} />
        <span>{t("try_again")}</span>
      </button>
    </main>
  );
}
