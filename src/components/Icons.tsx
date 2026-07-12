import type { ReactNode, SVGProps } from "react";
import logoUrl from "../assets/logo.png";

export type IconName =
  | "accounts"
  | "alert"
  | "check"
  | "clock"
  | "close"
  | "copy"
  | "error"
  | "extension"
  | "folder"
  | "info"
  | "key"
  | "loader"
  | "mail"
  | "minus"
  | "mini"
  | "plus"
  | "refresh"
  | "server"
  | "settings"
  | "shield"
  | "square"
  | "trash"
  | "user";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

const paths: Record<IconName, ReactNode> = {
  accounts: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <circle cx="9" cy="10" r="2.25" />
      <path d="M5.75 16c.55-1.65 1.63-2.5 3.25-2.5s2.7.85 3.25 2.5M15 9h3M15 13h3" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.4 2.75 17a2 2 0 0 0 1.75 3h15a2 2 0 0 0 1.75-3L13.7 3.4a2 2 0 0 0-3.4 0Z" />
      <path d="M12 8v4.5M12 16.5h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.25 4.25L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.5h.01" />
    </>
  ),
  extension: (
    <path d="M8.5 3.5h3V7h2V3.5h2a2 2 0 0 1 2 2v3H21v3h-3.5v2H21v3h-3.5v2a2 2 0 0 1-2 2h-3v-3.5h-2V20h-2a2 2 0 0 1-2-2v-2H3v-3h3.5v-2H3V8h3.5V5.5a2 2 0 0 1 2-2Z" />
  ),
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8M16 7l2 2M14 9l2 2" />
    </>
  ),
  loader: (
    <>
      <path d="M21 12a9 9 0 0 1-9 9" opacity=".28" />
      <path d="M12 3a9 9 0 0 1 9 9" />
      <path d="M3 12a9 9 0 0 1 9-9" opacity=".55" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  minus: <path d="M5 12h14" />,
  mini: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="11" y="11" width="8" height="6" rx="1" fill="currentColor" opacity="0.4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  square: <rect width="18" height="18" x="3" y="3" rx="2" />,
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M4.9 16.5A8.5 8.5 0 0 0 20 12M4 12a8.5 8.5 0 0 1 15.1-4.5" />
      <path d="M4 17v-5h5" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01M11 7h7M11 17h7" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.1H9.55V21a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.05 15a1.7 1.7 0 0 0-1.6-1H2.4V10h.05a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.5 4.2l.06.06A1.7 1.7 0 0 0 8.45 4a1.7 1.7 0 0 0 1.1-1.6v-.1h4.05v.1A1.7 1.7 0 0 0 14.7 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.1 8.4a1.7 1.7 0 0 0 1.6 1h.1v4.05h-.1a1.7 1.7 0 0 0-1.3 1.55Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.6 2.9 8.1 7 10 4.1-1.9 7-5.4 7-10V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21c.55-4.15 3.05-6.25 7.5-6.25s6.95 2.1 7.5 6.25" />
    </>
  ),
};

export function Icon({ name, size = 18, className, ...props }: IconProps) {
  const classes = ["icon", name === "loader" ? "icon--spin" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className={classes}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}

export function AppMark({ size = 30 }: { size?: number }) {
  return (
    <img
      aria-hidden="true"
      className="app-mark"
      src={logoUrl}
      alt="Antigravity Logo"
      width={size}
      height={size}
      style={{
        borderRadius: "20%",
        objectFit: "contain",
      }}
    />
  );
}
