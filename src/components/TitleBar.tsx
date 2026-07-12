import { getCurrentWindow } from "@tauri-apps/api/window";
import { Icon } from "./Icons";

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
        <span className="titlebar__icon" data-tauri-drag-region>
          <svg
            width="14"
            height="14"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
            data-tauri-drag-region
          >
            <defs>
              <linearGradient id="titlebar-gradient" x1="4" y1="4" x2="28" y2="28">
                <stop stopColor="#4a8cf7" />
                <stop offset=".55" stopColor="#6a73f7" />
                <stop offset="1" stopColor="#7de7f2" />
              </linearGradient>
            </defs>
            <circle cx="16" cy="16" r="14" fill="url(#titlebar-gradient)" />
            <circle cx="16" cy="16" r="4" fill="#baf7ff" />
          </svg>
        </span>
        <span className="titlebar__title" data-tauri-drag-region>
          Antigravity Account Switcher
        </span>
      </div>
      <div className="titlebar__right">
        <button
          className="titlebar__button titlebar__button--minimize"
          onClick={handleMinimize}
          title="Minimalizuj"
          aria-label="Minimalizuj"
        >
          <Icon name="minus" size={13} />
        </button>
        <button
          className="titlebar__button titlebar__button--maximize"
          onClick={handleMaximize}
          title="Maksymalizuj"
          aria-label="Maksymalizuj"
        >
          <Icon name="square" size={11} />
        </button>
        <button
          className="titlebar__button titlebar__button--close"
          onClick={handleClose}
          title="Zamknij"
          aria-label="Zamknij"
        >
          <Icon name="close" size={13} />
        </button>
      </div>
    </div>
  );
}
