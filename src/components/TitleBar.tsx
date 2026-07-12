import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icons";
import { t } from "../i18n";

export function TitleBar() {
  const appWindow = getCurrentWindow();

  const runWindowCommand = (command: Promise<void>) => {
    void command.catch((error: unknown) => {
      console.error("Window command failed:", error);
    });
  };

  const handleMinimize = () => {
    runWindowCommand(appWindow.minimize());
  };

  const handleMaximize = () => {
    runWindowCommand(appWindow.toggleMaximize());
  };

  const handleClose = () => {
    runWindowCommand(appWindow.close());
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar__left" data-tauri-drag-region>
        <span className="titlebar__title" data-tauri-drag-region>
          {t("titlebar_title")}
        </span>
      </div>
      <div className="titlebar__right">
        <button
          className="titlebar__button titlebar__button--minimize"
          onClick={handleMinimize}
          title={t("minimize")}
          aria-label={t("minimize")}
        >
          <Icon name="minus" size={13} />
        </button>
        <button
          className="titlebar__button titlebar__button--maximize"
          onClick={handleMaximize}
          title={t("maximize")}
          aria-label={t("maximize")}
        >
          <Icon name="square" size={11} />
        </button>
        <button
          className="titlebar__button titlebar__button--close"
          onClick={handleClose}
          title={t("close")}
          aria-label={t("close")}
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}
